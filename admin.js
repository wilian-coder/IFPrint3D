import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { firebaseConfig } from "./firebase-config.js";
import { supabaseConfig } from "./supabase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const BUCKET = "modelos-3d";

const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const list = document.getElementById("requestsList");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const viewerModal = document.getElementById("viewerModal");
const viewerStage = document.getElementById("viewerStage");
const viewerTitle = document.getElementById("viewerTitle");
const viewerInfo = document.getElementById("viewerInfo");
const viewerClose = document.getElementById("viewerClose");
const viewerReset = document.getElementById("viewerReset");

let allRequests = [], unsubscribeRequests = null;
let scene, camera, renderer, controls, currentMesh, animationId;

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { await signOut(auth); throw error; }
    loginMessage.innerHTML = "";
  } catch (error) {
    console.error(error);
    loginMessage.innerHTML = '<div class="alert error">Não foi possível entrar. Confira e-mail e senha.</div>';
  }
});

logoutButton.addEventListener("click", async () => {
  if (unsubscribeRequests) unsubscribeRequests();
  closeViewer();
  await Promise.allSettled([signOut(auth), supabase.auth.signOut()]);
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
viewerClose.addEventListener("click", closeViewer);
viewerReset.addEventListener("click", fitCameraToObject);
viewerModal.addEventListener("click", e => { if (e.target === viewerModal) closeViewer(); });
window.addEventListener("keydown", e => { if (e.key === "Escape") closeViewer(); });
window.addEventListener("resize", resizeViewer);

onAuthStateChanged(auth, async user => {
  if (!user) { loginCard.classList.remove("hidden"); dashboard.classList.add("hidden"); return; }
  const { data } = await supabase.auth.getSession();
  if (!data.session) { await signOut(auth).catch(() => {}); return; }
  loginCard.classList.add("hidden");
  dashboard.classList.remove("hidden");
  listenRequests();
});

function listenRequests() {
  if (unsubscribeRequests) unsubscribeRequests();
  const q = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
  unsubscribeRequests = onSnapshot(q, snapshot => {
    allRequests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats(); render();
  });
}

function render() {
  const search = searchInput.value.toLowerCase().trim();
  const filter = statusFilter.value;
  const filtered = allRequests.filter(item => {
    const text = `${item.studentName || ""} ${item.studentClass || ""} ${item.projectName || ""}`.toLowerCase();
    return (!search || text.includes(search)) && (filter === "todos" || item.status === filter);
  });

  list.innerHTML = filtered.length ? filtered.map(item => {
    const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString("pt-BR") : "";
    const status = item.status || "pendente";
    const fileName = item.originalFileName || "não informado";
    const isSTL = fileName.toLowerCase().endsWith(".stl");
    return `<article class="request">
      <div class="request-head"><div><h3>${escapeHtml(item.projectName || "Projeto sem nome")}</h3><div class="meta">${escapeHtml(item.studentName || "")} • ${escapeHtml(item.studentClass || "")} • ${date}</div></div><span class="badge">${labelStatus(status)}</span></div>
      <div class="description">${escapeHtml(item.description || "Sem descrição.")}</div>
      <div class="meta" style="margin-bottom:10px">Arquivo: ${escapeHtml(fileName)}</div>

      <div class="admin-message-box">
        <label>
          Mensagem para o aluno
          <textarea
            class="admin-message-input"
            data-id="${item.id}"
            maxlength="700"
            placeholder="Ex.: Seu arquivo foi aprovado e será impresso amanhã."
          >${escapeHtml(item.labMessage || "")}</textarea>
        </label>
        <div class="admin-message-footer">
          <span class="admin-message-state" data-message-state="${item.id}">
            ${item.labMessage ? "Mensagem salva" : "Nenhuma mensagem enviada"}
          </span>
          <button class="secondary-button save-message-button" data-id="${item.id}" type="button">
            Salvar mensagem
          </button>
        </div>
      </div>

      <div class="request-actions">
        <select data-id="${item.id}" class="status-select">${statusOptions(status)}</select>
        ${item.storagePath && isSTL ? `<button class="viewer-button" data-path="${escapeAttr(item.storagePath)}" data-name="${escapeAttr(fileName)}">Visualizar 3D</button>` : ""}
        ${item.storagePath ? `<button class="secondary-button download-button" data-path="${escapeAttr(item.storagePath)}" data-name="${escapeAttr(fileName)}">Baixar arquivo</button>` : `<span class="meta">Arquivo ainda não disponível</span>`}
      </div>
    </article>`;
  }).join("") : '<div class="empty">Nenhuma solicitação encontrada.</div>';

  document.querySelectorAll(".status-select").forEach(el => el.addEventListener("change", async () => {
    try {
      await updateDoc(doc(db, "submissions", el.dataset.id), {
        status: el.value,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(error);
      alert("Não foi possível alterar o status.");
    }
  }));

  document.querySelectorAll(".save-message-button").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.id;
    const textarea = document.querySelector(`.admin-message-input[data-id="${id}"]`);
    const state = document.querySelector(`[data-message-state="${id}"]`);
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
      await updateDoc(doc(db, "submissions", id), {
        labMessage: textarea.value.trim(),
        messageUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      state.textContent = textarea.value.trim() ? "Mensagem salva e enviada ao aluno" : "Mensagem removida";
    } catch (error) {
      console.error(error);
      state.textContent = "Erro ao salvar mensagem";
      alert("Não foi possível salvar a mensagem.");
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }));
  document.querySelectorAll(".download-button").forEach(btn => btn.addEventListener("click", async () => {
    const url = await getSignedUrl(btn.dataset.path, btn.dataset.name, true);
    window.open(url, "_blank", "noopener,noreferrer");
  }));
  document.querySelectorAll(".viewer-button").forEach(btn => btn.addEventListener("click", async () => {
    const original = btn.textContent; btn.disabled = true; btn.textContent = "Carregando...";
    try { const url = await getSignedUrl(btn.dataset.path, btn.dataset.name, false); openSTLViewer(url, btn.dataset.name); }
    catch (e) { console.error(e); alert("Não foi possível abrir o modelo 3D."); }
    finally { btn.disabled = false; btn.textContent = original; }
  }));
}

async function getSignedUrl(path, name, download) {
  const opts = download ? { download: name || true } : undefined;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120, opts);
  if (error) throw error;
  return data.signedUrl;
}

function openSTLViewer(url, name) {
  viewerModal.classList.remove("hidden");
  viewerTitle.textContent = name;
  viewerInfo.textContent = "Carregando modelo...";
  initViewer();

  new STLLoader().load(url, geometry => {
    if (currentMesh) { scene.remove(currentMesh); currentMesh.geometry.dispose(); currentMesh.material.dispose(); }
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    const material = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: .55, metalness: .08 });
    currentMesh = new THREE.Mesh(geometry, material);
    const box = geometry.boundingBox, center = new THREE.Vector3(), size = new THREE.Vector3();
    box.getCenter(center); box.getSize(size);
    currentMesh.position.sub(center); currentMesh.rotation.x = -Math.PI / 2;
    scene.add(currentMesh);
    viewerInfo.textContent = `Dimensões aproximadas: ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
    fitCameraToObject();
  }, undefined, error => { console.error(error); viewerInfo.textContent = "Erro ao carregar o STL."; });
}

function initViewer() {
  if (renderer) { resizeViewer(); return; }
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f7fb);
  camera = new THREE.PerspectiveCamera(45, 1, .1, 100000); camera.position.set(100,100,100);
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewerStage.innerHTML = ""; viewerStage.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2));
  const l1 = new THREE.DirectionalLight(0xffffff, 2.5); l1.position.set(100,180,120); scene.add(l1);
  const l2 = new THREE.DirectionalLight(0xffffff, 1.2); l2.position.set(-120,80,-100); scene.add(l2);
  scene.add(new THREE.GridHelper(300, 30, 0x94a3b8, 0xd6deea));
  resizeViewer(); animate();
}

function fitCameraToObject() {
  if (!currentMesh) return;
  const box = new THREE.Box3().setFromObject(currentMesh), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x,size.y,size.z) || 10, fov = camera.fov * Math.PI/180;
  let distance = maxDim / (2*Math.tan(fov/2)); distance *= 1.7;
  camera.position.set(center.x+distance, center.y+distance*.7, center.z+distance);
  camera.near = Math.max(distance/1000,.01); camera.far = distance*100; camera.updateProjectionMatrix();
  controls.target.copy(center); controls.update();
}

function resizeViewer() {
  if (!renderer || viewerModal.classList.contains("hidden")) return;
  const w = viewerStage.clientWidth || 800, h = viewerStage.clientHeight || 500;
  renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix();
}

function animate() {
  cancelAnimationFrame(animationId);
  const loop = () => { animationId = requestAnimationFrame(loop); controls?.update(); renderer?.render(scene,camera); };
  loop();
}

function closeViewer() {
  viewerModal.classList.add("hidden"); cancelAnimationFrame(animationId);
  if (currentMesh) { scene?.remove(currentMesh); currentMesh.geometry.dispose(); currentMesh.material.dispose(); currentMesh = null; }
}

function updateStats() {
  totalCount.textContent = allRequests.length;
  pendingCount.textContent = allRequests.filter(x => x.status === "pendente").length;
  printingCount.textContent = allRequests.filter(x => x.status === "imprimindo").length;
  doneCount.textContent = allRequests.filter(x => x.status === "concluido").length;
}
function statusOptions(current){return ["pendente","analise","aprovado","imprimindo","concluido","recusado"].map(v=>`<option value="${v}" ${v===current?"selected":""}>${labelStatus(v)}</option>`).join("");}
function labelStatus(s){return ({pendente:"Pendente",analise:"Em análise",aprovado:"Aprovado",imprimindo:"Imprimindo",concluido:"Concluído",recusado:"Recusado"})[s]||s;}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/`/g,"&#096;");}
