import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firebaseConfig } from "./firebase-config.js";
import { supabaseConfig } from "./supabase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BUCKET = "modelos-3d";

const warning = document.getElementById("configWarning");
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

const firebaseReady = !Object.values(firebaseConfig).some(v =>
  String(v).includes("COLE_") || String(v).includes("SEU-PROJETO")
);

const supabaseReady =
  supabaseConfig.url?.startsWith("https://") &&
  supabaseConfig.url?.includes(".supabase.co") &&
  supabaseConfig.publishableKey?.startsWith("sb_publishable_");

if (!firebaseReady || !supabaseReady) {
  warning.textContent = "Confira firebase-config.js e supabase-config.js antes de usar o site.";
  warning.classList.remove("hidden");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file ? `${file.name} (${formatBytes(file.size)})` : "Nenhum arquivo selecionado";
});

description.addEventListener("input", () => {
  charCount.textContent = description.value.length;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultArea.innerHTML = "";

  if (!firebaseReady || !supabaseReady) {
    return showResult("Confira as configurações do Firebase e do Supabase antes de enviar.", "error");
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

  let docRef = null;

  try {
    setBusy(true, "Registrando solicitação...");
    progressBar.style.width = "15%";

   const userCredential = await signInAnonymously(auth);

docRef = await addDoc(collection(db, "submissions"), {
      ownerUid: userCredential.user.uid,
      studentName: document.getElementById("studentName").value.trim(),
      studentClass: document.getElementById("studentClass").value.trim(),
      projectName: document.getElementById("projectName").value.trim(),
      description: description.value.trim(),
      originalFileName: file.name,
      fileSize: file.size,
      fileType: extension,
      status: "pendente",
      createdAt: serverTimestamp(),
      storageProvider: "supabase",
      storageBucket: BUCKET,
      storagePath: ""
    });

    progressBar.style.width = "35%";
    progressText.textContent = "Enviando arquivo 3D...";

    const storagePath = `${docRef.id}/${Date.now()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) {
      await deleteDoc(doc(db, "submissions", docRef.id)).catch(() => {});
      throw uploadError;
    }

    progressBar.style.width = "85%";
    progressText.textContent = "Finalizando solicitação...";

    await updateDoc(doc(db, "submissions", docRef.id), { storagePath });

    progressBar.style.width = "100%";
    progressText.textContent = "Concluído.";

    const protocol = docRef.id;

    form.reset();
    fileName.textContent = "Nenhum arquivo selecionado";
    charCount.textContent = "0";

    resultArea.innerHTML = `
      <div class="alert success">
        <strong>Solicitação enviada com sucesso!</strong><br>
        Seu pedido foi registrado. Guarde este código:
        <strong>${escapeHtml(protocol)}</strong>.
      </div>`;

    setTimeout(() => {
      progressArea.classList.add("hidden");
      progressBar.style.width = "0%";
    }, 700);
  } catch (error) {
    console.error("Erro no envio:", error);

    let message = "Não foi possível enviar a solicitação.";
    const txt = String(error?.message || "").toLowerCase();

    if (txt.includes("row-level security")) {
      message = "O Supabase bloqueou o upload. Confira se a política INSERT do bucket modelos-3d está ativa para anon.";
    } else if (txt.includes("bucket")) {
      message = "Não foi possível acessar o bucket modelos-3d. Confira o nome e as configurações no Supabase.";
    }

    showResult(message, "error");
    progressArea.classList.add("hidden");
    progressBar.style.width = "0%";
  } finally {
    setBusy(false);
  }
});

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

function safeFileName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}
