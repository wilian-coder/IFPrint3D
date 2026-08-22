import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firebaseConfig } from "./firebase-config.js";
import { supabaseConfig } from "./supabase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const BUCKET = "modelos-3d";

const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const list = document.getElementById("requestsList");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");

let allRequests = [];
let unsubscribeRequests = null;

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMessage.innerHTML = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    loginMessage.innerHTML = `<div class="alert warning">Entrando no painel...</div>`;

    await signInWithEmailAndPassword(auth, email, password);

    const { error: supabaseError } = await supabase.auth.signInWithPassword({ email, password });

    if (supabaseError) {
      await signOut(auth).catch(() => {});
      throw new Error("Firebase aceitou o login, mas o Supabase recusou. Confira se o mesmo e-mail e senha foram cadastrados no Supabase.");
    }

    loginMessage.innerHTML = "";
  } catch (error) {
    console.error("Erro no login:", error);
    await supabase.auth.signOut().catch(() => {});
    loginMessage.innerHTML = `<div class="alert error">${escapeHtml(error?.message || "E-mail ou senha incorretos.")}</div>`;
  }
});

logoutButton.addEventListener("click", async () => {
  if (unsubscribeRequests) {
    unsubscribeRequests();
    unsubscribeRequests = null;
  }

  await Promise.allSettled([signOut(auth), supabase.auth.signOut()]);
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginCard.classList.remove("hidden");
    dashboard.classList.add("hidden");
    allRequests = [];
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    await signOut(auth).catch(() => {});
    loginCard.classList.remove("hidden");
    dashboard.classList.add("hidden");
    loginMessage.innerHTML = `<div class="alert warning">Faça login novamente para habilitar também o acesso aos arquivos.</div>`;
    return;
  }

  loginCard.classList.add("hidden");
  dashboard.classList.remove("hidden");
  listenRequests();
});

function listenRequests() {
  if (unsubscribeRequests) unsubscribeRequests();

  const q = query(collection(db, "submissions"), orderBy("createdAt", "desc"));

  unsubscribeRequests = onSnapshot(q, snapshot => {
    allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    render();
  }, error => {
    console.error(error);
    list.innerHTML = `<div class="empty">Não foi possível carregar as solicitações. Verifique as regras do Firestore e o e-mail do administrador.</div>`;
  });
}

function render() {
  const search = searchInput.value.toLowerCase().trim();
  const filter = statusFilter.value;

  const filtered = allRequests.filter(item => {
    const text = `${item.studentName || ""} ${item.studentClass || ""} ${item.projectName || ""}`.toLowerCase();
    return (!search || text.includes(search)) && (filter === "todos" || item.status === filter);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">Nenhuma solicitação encontrada.</div>`;
    return;
  }

  list.innerHTML = filtered.map(item => {
    const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString("pt-BR") : "Data não disponível";
    const status = item.status || "pendente";

    return `
      <article class="request">
        <div class="request-head">
          <div>
            <h3>${escapeHtml(item.projectName || "Projeto sem nome")}</h3>
            <div class="meta">${escapeHtml(item.studentName || "")} • ${escapeHtml(item.studentClass || "")} • ${date}</div>
          </div>
          <span class="badge">${labelStatus(status)}</span>
        </div>

        <div class="description">${escapeHtml(item.description || "Sem descrição.")}</div>
        <div class="meta" style="margin-bottom:10px">Arquivo: ${escapeHtml(item.originalFileName || "não informado")}</div>

        <div class="request-actions">
          <select data-id="${item.id}" class="status-select">
            ${statusOptions(status)}
          </select>

          ${item.storagePath
            ? `<button class="secondary-button download-button" data-path="${escapeAttr(item.storagePath)}" data-name="${escapeAttr(item.originalFileName || "modelo-3d")}">Baixar arquivo</button>`
            : `<span class="meta">Arquivo ainda não disponível</span>`}
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".status-select").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await updateDoc(doc(db, "submissions", select.dataset.id), { status: select.value });
      } catch (error) {
        console.error(error);
        alert("Não foi possível alterar o status.");
      }
    });
  });

  document.querySelectorAll(".download-button").forEach(button => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando download...";

      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(button.dataset.path, 60, {
            download: button.dataset.name || true
          });

        if (error) throw error;
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Erro no download:", error);
        const txt = String(error?.message || "").toLowerCase();

        if (txt.includes("row-level security")) {
          alert("O Supabase bloqueou o download. Confira a política SELECT do bucket modelos-3d para authenticated.");
        } else {
          alert("Não foi possível baixar o arquivo. Confira sua sessão do Supabase e as políticas do Storage.");
        }
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

function updateStats() {
  document.getElementById("totalCount").textContent = allRequests.length;
  document.getElementById("pendingCount").textContent = allRequests.filter(x => x.status === "pendente").length;
  document.getElementById("printingCount").textContent = allRequests.filter(x => x.status === "imprimindo").length;
  document.getElementById("doneCount").textContent = allRequests.filter(x => x.status === "concluido").length;
}

function statusOptions(current) {
  const values = ["pendente", "analise", "aprovado", "imprimindo", "concluido", "recusado"];
  return values.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${labelStatus(v)}</option>`).join("");
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
