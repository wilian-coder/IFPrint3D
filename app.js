import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firebaseConfig } from "./firebase-config.js";
import { supabaseConfig } from "./supabase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const BUCKET = "modelos-3d";

const authSection = document.getElementById("authSection");
const studentArea = document.getElementById("studentArea");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginFormStudent");
const registerForm = document.getElementById("registerFormStudent");
const authMessage = document.getElementById("authMessageStudent");
const logoutButton = document.getElementById("logoutStudentButton");
const topUserName = document.getElementById("topUserName");

const newRequestButton = document.getElementById("newRequestButton");
const closeRequestButton = document.getElementById("closeRequestButton");
const newRequestSection = document.getElementById("newRequestSection");
const studentRequestsList = document.getElementById("studentRequestsList");
const studentStatusFilter = document.getElementById("studentStatusFilter");

const form = document.getElementById("submissionForm");
const fileInput = document.getElementById("modelFile");
const fileName = document.getElementById("fileName");
const description = document.getElementById("description");
const charCount = document.getElementById("charCount");
const button = document.getElementById("submitButton");
const progressArea = document.getElementById("progressArea");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const resultArea = document.getElementById("resultArea");
const warning = document.getElementById("configWarning");

const detailsModal = document.getElementById("studentDetailsModal");
const detailsCloseButton = document.getElementById("detailsCloseButton");
const detailsProjectName = document.getElementById("detailsProjectName");
const detailsCode = document.getElementById("detailsCode");
const detailsStatus = document.getElementById("detailsStatus");
const detailsTimeline = document.getElementById("detailsTimeline");
const detailsLabMessage = document.getElementById("detailsLabMessage");
const detailsMessageDate = document.getElementById("detailsMessageDate");
const detailsCreatedAt = document.getElementById("detailsCreatedAt");
const detailsUpdatedAt = document.getElementById("detailsUpdatedAt");
const detailsFileName = document.getElementById("detailsFileName");
const detailsClass = document.getElementById("detailsClass");
const detailsDescription = document.getElementById("detailsDescription");

let currentProfile = null;
let studentRequests = [];
let unsubscribeStudentRequests = null;

const firebaseReady = !Object.values(firebaseConfig).some(v =>
  String(v).includes("COLE_") || String(v).includes("SEU-PROJETO")
);

const supabaseReady =
  supabaseConfig.url?.startsWith("https://") &&
  supabaseConfig.url?.includes(".supabase.co") &&
  supabaseConfig.publishableKey?.startsWith("sb_publishable_");

if (!firebaseReady || !supabaseReady) {
  warning.textContent = "Confira firebase-config.js e supabase-config.js.";
  warning.classList.remove("hidden");
}

loginTab.addEventListener("click", () => showAuthMode("login"));
registerTab.addEventListener("click", () => showAuthMode("register"));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.innerHTML = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );
  } catch (error) {
    console.error(error);
    authMessage.innerHTML = `<div class="alert error">${friendlyAuthError(error)}</div>`;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.innerHTML = "";

  const name = document.getElementById("registerName").value.trim();
  const studentClass = document.getElementById("registerClass").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(credential.user, { displayName: name });

    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      studentClass,
      email,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    authMessage.innerHTML = `<div class="alert error">${friendlyAuthError(error)}</div>`;
  }
});

logoutButton.addEventListener("click", async () => {
  if (unsubscribeStudentRequests) {
    unsubscribeStudentRequests();
    unsubscribeStudentRequests = null;
  }
  await signOut(auth);
});

newRequestButton.addEventListener("click", () => {
  newRequestSection.classList.remove("hidden");
  newRequestSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

closeRequestButton.addEventListener("click", () => {
  newRequestSection.classList.add("hidden");
});

studentStatusFilter.addEventListener("change", renderStudentRequests);

detailsCloseButton.addEventListener("click", closeStudentDetails);
detailsModal.addEventListener("click", (event) => {
  if (event.target === detailsModal) closeStudentDetails();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !detailsModal.classList.contains("hidden")) {
    closeStudentDetails();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file
    ? `${file.name} (${formatBytes(file.size)})`
    : "Nenhum arquivo selecionado";
});

description.addEventListener("input", () => {
  charCount.textContent = description.value.length;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentProfile = null;
    studentRequests = [];
    authSection.classList.remove("hidden");
    studentArea.classList.add("hidden");
    logoutButton.classList.add("hidden");
    topUserName.classList.add("hidden");
    showAuthMode("login");
    return;
  }

  try {
    currentProfile = await loadOrCreateProfile(user);

    authSection.classList.add("hidden");
    studentArea.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    topUserName.classList.remove("hidden");

    const displayName = currentProfile.name || user.displayName || "Aluno";
    document.getElementById("welcomeName").textContent = firstName(displayName);
    topUserName.textContent = displayName;

    document.getElementById("studentName").value = currentProfile.name || "";
    document.getElementById("studentClass").value = currentProfile.studentClass || "";

    listenStudentRequests(user.uid);
  } catch (error) {
    console.error(error);
    authMessage.innerHTML = `<div class="alert error">Não foi possível carregar sua conta.</div>`;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultArea.innerHTML = "";

  const user = auth.currentUser;
  if (!user) {
    return showResult("Entre na sua conta antes de enviar um pedido.", "error");
  }

  if (!firebaseReady || !supabaseReady) {
    return showResult("Confira as configurações do Firebase e do Supabase.", "error");
  }

  const file = fileInput.files[0];
  if (!file) return showResult("Selecione um arquivo 3D.", "error");

  const allowed = [".stl", ".3mf", ".obj"];
  const extension = "." + file.name.split(".").pop().toLowerCase();

  if (!allowed.includes(extension)) {
    return showResult("Formato inválido. Envie STL, 3MF ou OBJ.", "error");
  }

  if (file.size > 50 * 1024 * 1024) {
    return showResult("O arquivo ultrapassa o limite de 50 MB.", "error");
  }

  try {
    setBusy(true, "Preparando pedido...");
    progressBar.style.width = "15%";

    // Gera um ID antes de gravar no Firestore.
    const submissionRef = doc(collection(db, "submissions"));
    const storagePath = `${submissionRef.id}/${Date.now()}-${safeFileName(file.name)}`;

    progressText.textContent = "Enviando arquivo 3D...";
    progressBar.style.width = "35%";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) throw uploadError;

    progressBar.style.width = "80%";
    progressText.textContent = "Registrando solicitação...";

    const studentName = document.getElementById("studentName").value.trim();
    const studentClass = document.getElementById("studentClass").value.trim();

    await setDoc(submissionRef, {
      ownerUid: user.uid,
      studentName,
      studentClass,
      projectName: document.getElementById("projectName").value.trim(),
      description: description.value.trim(),
      originalFileName: file.name,
      fileSize: file.size,
      fileType: extension,
      status: "pendente",
      labMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      storageProvider: "supabase",
      storageBucket: BUCKET,
      storagePath
    });

    // Atualiza nome/turma da conta para facilitar próximos pedidos.
    await setDoc(doc(db, "users", user.uid), {
      name: studentName,
      studentClass,
      email: user.email
    }, { merge: true });

    currentProfile = {
      ...currentProfile,
      name: studentName,
      studentClass
    };

    progressBar.style.width = "100%";
    progressText.textContent = "Concluído.";

    form.reset();
    document.getElementById("studentName").value = studentName;
    document.getElementById("studentClass").value = studentClass;
    fileName.textContent = "Nenhum arquivo selecionado";
    charCount.textContent = "0";

    resultArea.innerHTML = `
      <div class="alert success">
        <strong>Solicitação enviada com sucesso!</strong><br>
        Seu pedido já aparece em <strong>Minhas impressões</strong>.<br>
        Código: <strong>${submissionRef.id}</strong>
      </div>`;

    setTimeout(() => {
      progressArea.classList.add("hidden");
      progressBar.style.width = "0%";
    }, 800);
  } catch (error) {
    console.error("Erro no envio:", error);
    showResult("Não foi possível enviar a solicitação. Abra o Console (F12) se o erro continuar.", "error");
    progressArea.classList.add("hidden");
    progressBar.style.width = "0%";
  } finally {
    setBusy(false);
  }
});

async function loadOrCreateProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return snap.data();

  const profile = {
    name: user.displayName || "",
    studentClass: "",
    email: user.email || "",
    createdAt: serverTimestamp()
  };

  await setDoc(ref, profile);
  return profile;
}

function listenStudentRequests(uid) {
  if (unsubscribeStudentRequests) unsubscribeStudentRequests();

  const q = query(
    collection(db, "submissions"),
    where("ownerUid", "==", uid)
  );

  unsubscribeStudentRequests = onSnapshot(q, snapshot => {
    studentRequests = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    studentRequests.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));

    updateStudentStats();
    renderStudentRequests();
  }, error => {
    console.error("Erro ao carregar histórico:", error);
    studentRequestsList.innerHTML = `<div class="empty">Não foi possível carregar seu histórico.</div>`;
  });
}

function renderStudentRequests() {
  const filter = studentStatusFilter.value;

  const filtered = studentRequests.filter(item =>
    filter === "todos" || item.status === filter
  );

  if (!filtered.length) {
    studentRequestsList.innerHTML = `
      <div class="empty">
        ${studentRequests.length ? "Nenhum pedido com esse status." : "Você ainda não possui solicitações. Clique em “Nova solicitação” para enviar a primeira."}
      </div>`;
    return;
  }

  studentRequestsList.innerHTML = filtered.map(item => {
    const status = item.status || "pendente";
    const date = item.createdAt?.toDate
      ? item.createdAt.toDate().toLocaleString("pt-BR")
      : "Data não disponível";

    return `
      <article class="student-request-item student-request-clickable" data-request-id="${item.id}" tabindex="0" role="button" aria-label="Abrir detalhes do pedido ${escapeAttr(item.projectName || "Projeto")}">
        <div class="student-request-main">
          <div class="student-request-icon">${statusIcon(status)}</div>
          <div>
            <h3>${escapeHtml(item.projectName || "Projeto sem nome")}</h3>
            <p>${escapeHtml(item.description || "")}</p>
            ${item.labMessage ? `<div class="student-message-preview">💬 ${escapeHtml(item.labMessage)}</div>` : ""}
            <span>${date} • Código ${escapeHtml(item.id.slice(0, 8))}</span>
          </div>
        </div>

        <div class="student-request-status">
          <span class="student-status ${status}">${labelStatus(status)}</span>
          <div class="mini-timeline">${timelineHtml(status)}</div>
          <span class="details-hint">Ver detalhes →</span>
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".student-request-clickable").forEach(card => {
    const open = () => openStudentDetails(card.dataset.requestId);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function openStudentDetails(id) {
  const item = studentRequests.find(request => request.id === id);
  if (!item) return;

  const status = item.status || "pendente";

  detailsProjectName.textContent = item.projectName || "Projeto sem nome";
  detailsCode.textContent = `Código do pedido: ${item.id}`;
  detailsStatus.textContent = `${statusIcon(status)} ${labelStatus(status)}`;
  detailsStatus.className = `student-status ${status}`;
  detailsTimeline.innerHTML = fullTimelineHtml(status);

  detailsLabMessage.textContent = item.labMessage?.trim()
    ? item.labMessage
    : "Ainda não há mensagem do laboratório para esta solicitação.";

  detailsMessageDate.textContent = item.messageUpdatedAt?.toDate
    ? `Mensagem atualizada em ${item.messageUpdatedAt.toDate().toLocaleString("pt-BR")}`
    : "";

  detailsCreatedAt.textContent = formatTimestamp(item.createdAt);
  detailsUpdatedAt.textContent = formatTimestamp(item.updatedAt || item.createdAt);
  detailsFileName.textContent = item.originalFileName || "Não informado";
  detailsClass.textContent = item.studentClass || "Não informada";
  detailsDescription.textContent = item.description || "Sem descrição.";

  detailsModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeStudentDetails() {
  detailsModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function fullTimelineHtml(status) {
  const steps = [
    ["pendente", "Recebido"],
    ["analise", "Em análise"],
    ["aprovado", "Aprovado"],
    ["imprimindo", "Imprimindo"],
    ["concluido", "Concluído"]
  ];

  if (status === "recusado") {
    return `
      <div class="details-timeline-row rejected">
        <span class="details-step-dot"></span>
        <strong>Solicitação recusada</strong>
      </div>`;
  }

  const currentIndex = steps.findIndex(([value]) => value === status);

  return steps.map(([value, label], index) => `
    <div class="details-timeline-row ${index <= currentIndex ? "done" : ""} ${value === status ? "current" : ""}">
      <span class="details-step-dot"></span>
      <strong>${label}</strong>
    </div>
  `).join("");
}

function formatTimestamp(value) {
  return value?.toDate ? value.toDate().toLocaleString("pt-BR") : "—";
}

function updateStudentStats() {
  const done = studentRequests.filter(x => x.status === "concluido").length;
  const active = studentRequests.filter(x =>
    !["concluido", "recusado"].includes(x.status)
  ).length;

  document.getElementById("studentTotal").textContent = studentRequests.length;
  document.getElementById("studentActive").textContent = active;
  document.getElementById("studentDone").textContent = done;
}

function timelineHtml(status) {
  const steps = ["pendente", "analise", "aprovado", "imprimindo", "concluido"];
  if (status === "recusado") {
    return `<span class="timeline-rejected">Solicitação recusada</span>`;
  }

  const currentIndex = steps.indexOf(status);

  return steps.map((step, index) => `
    <span class="timeline-dot ${index <= currentIndex ? "done" : ""}" title="${labelStatus(step)}"></span>
  `).join("");
}

function statusIcon(status) {
  return ({
    pendente: "🟡",
    analise: "🔵",
    aprovado: "🟢",
    imprimindo: "🖨️",
    concluido: "✅",
    recusado: "🔴"
  })[status] || "📦";
}

function labelStatus(status) {
  return ({
    pendente: "Pendente",
    analise: "Em análise",
    aprovado: "Aprovado",
    imprimindo: "Imprimindo",
    concluido: "Concluído",
    recusado: "Recusado"
  })[status] || status;
}

function showAuthMode(mode) {
  const isLogin = mode === "login";
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);
  authMessage.innerHTML = "";
}

function setBusy(busy, text = "Enviando...") {
  button.disabled = busy;
  button.style.opacity = busy ? ".65" : "1";
  button.textContent = busy ? text : "Enviar solicitação";

  if (busy) {
    progressArea.classList.remove("hidden");
    progressText.textContent = text;
  }
}

function showResult(message, type) {
  resultArea.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
}

function friendlyAuthError(error) {
  const code = error?.code || "";

  if (code.includes("email-already-in-use")) return "Este e-mail já possui uma conta.";
  if (code.includes("invalid-credential")) return "E-mail ou senha incorretos.";
  if (code.includes("weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (code.includes("invalid-email")) return "Digite um e-mail válido.";
  if (code.includes("too-many-requests")) return "Muitas tentativas. Aguarde um pouco e tente novamente.";

  return "Não foi possível concluir. Confira os dados e tente novamente.";
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "Aluno";
}

function safeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function timestampMs(value) {
  if (value?.toMillis) return value.toMillis();
  return 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}


function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
