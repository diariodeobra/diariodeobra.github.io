(function(){
"use strict";
const VERSAO="12/11/2026 10:30";
const $=id=>document.getElementById(id);
const CENTRAL=window.CENTRAL_FERRAMENTAS||{};
const temCentral=()=>!!(CENTRAL.url&&CENTRAL.chave);
const TIPOS_CONF=["Retirada do kit","Devolução do kit","Conferência periódica"];
const CONDS={ok:"Conforme",dan:"Danificada",man:"Em manutenção",falta:"Faltando"};
const TIPOS_OC=["Quebra / defeito","Perda","Furto / roubo","Enviar para manutenção","Solicitar material do almoxarifado","Outro"];
const ST_CONF={pendente:["Aguardando aprovação","c-info"],aprovada:["Aprovada","c-ok"],devolvida:["Devolvida","c-bad"]};
const ST_OC={aberta:["Aberta","c-bad"],andamento:["Em andamento","c-warn"],resolvida:["Resolvida","c-ok"]};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=iso=>{if(!iso)return"—";const d=new Date(iso);return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});};
let toastT;function toast(m,ms){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms||3200);}
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};

/* ---------- banco local (IndexedDB): fila de envio, rascunho e dados ---------- */
let dbp=null;
function idb(){
  if(dbp)return dbp;
  dbp=new Promise((ok,no)=>{const rq=indexedDB.open("ferramentas-ectas",1);
    rq.onupgradeneeded=()=>{const d=rq.result;d.createObjectStore("fila",{keyPath:"uid"});d.createObjectStore("kv");};
    rq.onsuccess=()=>ok(rq.result);rq.onerror=()=>no(rq.error);});
  return dbp;
}
async function tx(store,mode,fn){const d=await idb();return new Promise((ok,no)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let r;const q=fn(s);if(q&&"onsuccess" in q)q.onsuccess=()=>{r=q.result;};t.oncomplete=()=>ok(r);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);});}
const filaAll=()=>tx("fila","readonly",s=>s.getAll());
const filaPut=r=>tx("fila","readwrite",s=>s.put(r));
const filaDel=uid=>tx("fila","readwrite",s=>s.delete(uid));
const kvGet=k=>tx("kv","readonly",s=>s.get(k));
const kvPut=(k,v)=>tx("kv","readwrite",s=>s.put(v,k));

const S={tab:"conferir",dados:null,fila:[],meus:null,draft:null,oc:{},filterPend:false,online:navigator.onLine};

/* ---------- sessão do técnico (usuário e senha cadastrados pelo supervisor) ---------- */
const lerSessao=()=>ls.get("fer-sessao",null);
const gravarSessao=s=>ls.set("fer-sessao",s);
const MSG_SESSAO="Sua sessão terminou (senha redefinida ou usuário alterado pelo supervisor). Entre novamente. O que está na fila continua no celular.";
function mostrarLogin(motivo){
  $("b-sair").hidden=true;modoBloqueio(false);
  $("v-entrar").hidden=false;$("nav").hidden=true;$("main").hidden=true;$("stickyHost").innerHTML="";
  if(!motivo&&ls.get("fer-sessao-msg",0))motivo=MSG_SESSAO;ls.set("fer-sessao-msg",null);
  $("l-msg").textContent=motivo||"";$("l-msg").className="msg"+(motivo?" err":"");
  const u=$("l-usuario");if(!u.value)u.value=(lerSessao()||{}).usuario||ls.get("fer-ultimo-usuario","")||"";
  setTimeout(preencherSenhaSalva,0);
}
function esconderLogin(){$("v-entrar").hidden=true;$("nav").hidden=false;$("main").hidden=false;$("b-sair").hidden=false;render();}
$("f-entrar").addEventListener("submit",async e=>{
  e.preventDefault();
  const usuario=$("l-usuario").value.trim().toLowerCase(),senha=$("l-senha").value;
  const erro=t=>{$("l-msg").textContent=t;$("l-msg").className="msg err";};
  if(!usuario||!senha)return erro("Digite o usuário e a senha.");
  if(bloqueado()&&!navigator.onLine){
    if(await senhaLocalOk(usuario,senha)){if($("l-lembrar").checked)await lembrarSenha(usuario,senha);else esquecerSenha();$("l-senha").value="";desbloquear();toast("App desbloqueado.");}
    else{erro("Senha incorreta.");$("l-senha").value="";}
    return;
  }
  if(!temCentral())return erro("O aplicativo ainda não está ligado à central. Avise o supervisor.");
  if(!navigator.onLine)return erro("Para entrar é preciso internet. Depois o app funciona sem sinal.");
  const b=$("b-entrar");b.disabled=true;$("l-msg").textContent="Entrando…";$("l-msg").className="msg";
  try{
    const res=await chamar({acao:"login",usuario,senha},true);
    if(!res.ok){
      const d=temSenhaSalva();
      if(d&&d.u===usuario&&/incorret/i.test(res.erro||"")){esquecerSenha();$("l-lembrar").checked=false;$("l-senha").value="";throw new Error("A senha salva não vale mais (o supervisor pode ter trocado). Digite a senha nova.");}
      throw new Error(res.erro||"Não consegui entrar.");
    }
    const eraBloqueio=bloqueado();
    const anterior=lerSessao();
    gravarSessao({token:res.token,usuario:res.usuario.login,nome:res.usuario.nome});
    await guardarSenhaLocal(usuario,senha);
    if($("l-lembrar").checked)await lembrarSenha(usuario,senha);else esquecerSenha();
    marcarUso(true);ls.set("fer-ultimo-usuario",res.usuario.login);
    $("l-senha").value="";
    if(eraBloqueio){desbloquear();}
    else{if(!anterior||anterior.usuario!==res.usuario.login){S.meus=null;await kvPut("meus",null);}esconderLogin();toast("Olá, "+res.usuario.nome+".");}
    atualizarDados();sincronizar();
  }catch(err){erro(err.message||"Não consegui entrar. Verifique a internet.");}
  finally{b.disabled=false;}
});
let confirmaSair=false,tSair=null;
$("b-sair").onclick=()=>{
  const pend=S.fila.filter(f=>f.estado!=="recusado").length;
  if(!confirmaSair){confirmaSair=true;$("b-sair").textContent=pend?"Há "+pend+" registro(s) sem envio. Toque de novo":"Toque de novo para sair";$("b-sair").classList.add("alerta");
    clearTimeout(tSair);tSair=setTimeout(()=>{confirmaSair=false;$("b-sair").textContent="Sair";$("b-sair").classList.remove("alerta");},5000);return;}
  confirmaSair=false;clearTimeout(tSair);$("b-sair").textContent="Sair";$("b-sair").classList.remove("alerta");
  gravarSessao(null);ls.set("fer-bloqueio",null);$("l-usuario").value="";mostrarLogin("");
};
$("l-outro").onclick=()=>{gravarSessao(null);ls.set("fer-bloqueio",null);ls.set("fer-desbloq",null);esquecerSenha();$("l-usuario").value="";mostrarLogin("");$("l-usuario").focus();};
function sessaoInvalida(){gravarSessao(null);esquecerSenha();ls.set("fer-bloqueio",null);ls.set("fer-desbloq",null);ls.set("fer-sessao-msg",1);mostrarLogin(MSG_SESSAO);}

/* senha lembrada no celular: cifrada com uma chave que não sai do aparelho */
function chaveDb(){return new Promise((ok,no)=>{const q=indexedDB.open("ferramentas-chave",1);q.onupgradeneeded=()=>q.result.createObjectStore("k");q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});}
async function chaveCifra(){
  const d=await chaveDb();
  const ler=()=>new Promise((ok,no)=>{const r=d.transaction("k").objectStore("k").get("aes");r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  let k=await ler();
  if(!k){k=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    await new Promise((ok,no)=>{const t=d.transaction("k","readwrite");t.objectStore("k").put(k,"aes");t.oncomplete=ok;t.onerror=()=>no(t.error);});}
  return k;
}
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),deb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function lembrarSenha(usuario,senha){try{const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},await chaveCifra(),new TextEncoder().encode(senha));ls.set("fer-senha-salva",{u:usuario,iv:b64(iv),ct:b64(ct)});}catch(e){}}
const esquecerSenha=()=>ls.set("fer-senha-salva",null);
const temSenhaSalva=()=>ls.get("fer-senha-salva",null);
async function senhaSalva(usuario){const d=temSenhaSalva();if(!d||d.u!==usuario)return"";try{const p=await crypto.subtle.decrypt({name:"AES-GCM",iv:deb64(d.iv)},await chaveCifra(),deb64(d.ct));return new TextDecoder().decode(p);}catch(e){esquecerSenha();return"";}}
async function preencherSenhaSalva(){
  const u=$("l-usuario").value.trim().toLowerCase(),d=temSenhaSalva();
  $("l-lembrar").checked=!!d&&(!u||d.u===u);
  if(!u||!d||d.u!==u)return;
  const s=await senhaSalva(u);
  if(s&&!$("v-entrar").hidden&&!$("l-senha").value){$("l-senha").value=s;$("b-entrar").focus();if(!$("l-msg").textContent){$("l-msg").textContent="Senha salva neste celular. Toque em Entrar.";$("l-msg").className="msg";}}
}
$("l-usuario").addEventListener("change",()=>{$("l-senha").value="";preencherSenhaSalva();});
$("l-lembrar").addEventListener("change",()=>{if(!$("l-lembrar").checked)esquecerSenha();});
/* bloqueio por inatividade: 20 minutos sem uso volta para a senha, sem perder o que foi preenchido */
const INATIVO_MS=20*60*1000;let ultimoUso=Date.now();
const bloqueado=()=>ls.get("fer-bloqueio",0)===1;
function marcarUso(forcar){if(!forcar&&(bloqueado()||!lerSessao()))return;const t=Date.now();if(!forcar&&t-ultimoUso<5000)return;ultimoUso=t;ls.set("fer-ultimo-uso",t);}
["pointerdown","keydown","touchstart","scroll","input"].forEach(ev=>addEventListener(ev,()=>marcarUso(),{passive:true,capture:true}));
function verificarInatividade(){if(!lerSessao()||bloqueado()||!$("scanner").hidden)return;if(Date.now()-Math.max(ultimoUso,ls.get("fer-ultimo-uso",0))>=INATIVO_MS)bloquearApp();}
function modoBloqueio(on){$("l-usuario").readOnly=on;$("l-outro-box").hidden=!on;
  $("l-intro").textContent=on?"Por segurança, o app foi bloqueado após 20 minutos sem uso. Digite sua senha para continuar. O que você estava preenchendo não se perde.":"Use o usuário e a senha cadastrados pelo supervisor.";}
function bloquearApp(){const s=lerSessao();if(!s)return;ls.set("fer-bloqueio",1);salvarRascunho(true);mostrarLogin("");modoBloqueio(true);$("l-usuario").value=s.usuario;$("l-senha").value="";preencherSenhaSalva();}
function desbloquear(){ls.set("fer-bloqueio",null);marcarUso(true);modoBloqueio(false);esconderLogin();}
setInterval(verificarInatividade,30000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")verificarInatividade();});
async function resumoSenha(usuario,senha,sal){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sal+"|"+usuario+"|"+senha));return btoa(String.fromCharCode(...new Uint8Array(b)));}
async function guardarSenhaLocal(usuario,senha){try{const sal=crypto.getRandomValues(new Uint32Array(4)).join("-");ls.set("fer-desbloq",{u:usuario,sal,h:await resumoSenha(usuario,senha,sal)});}catch(e){}}
async function senhaLocalOk(usuario,senha){try{const d=ls.get("fer-desbloq",null);if(!d||d.u!==usuario)return false;return (await resumoSenha(usuario,senha,d.sal))===d.h;}catch(e){return false;}}

/* ---------- central ---------- */
async function chamar(o,semToken){
  const s=lerSessao();
  if(!semToken&&!s)throw new Error("sem login");
  const r=await fetch(CENTRAL.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...o,chave:CENTRAL.chave,...(semToken?{}:{token:s.token})})});
  const res=await r.json();
  if(!semToken&&!res.ok&&res.erro==="sessao"){sessaoInvalida();const e=new Error("login necessário");e.sessao=true;throw e;}
  return res;
}
async function atualizarDados(){
  if(!temCentral()||!navigator.onLine||!lerSessao()||bloqueado())return;
  try{const r=await chamar({acao:"dados"});if(r.ok){S.dados={ferramentas:r.ferramentas,kits:r.kits,pecas:r.pecas,prazo:r.prazo,em:new Date().toISOString()};await kvPut("dados",S.dados);
    const s=lerSessao();if(s&&r.usuario&&r.usuario.nome!==s.nome)gravarSessao({...s,nome:r.usuario.nome});schedule();}}catch(e){}
}
async function atualizarMeus(){
  if(!temCentral()||!navigator.onLine||!lerSessao()||bloqueado())return;
  try{const r=await chamar({acao:"meus"});if(r.ok){S.meus={conferencias:r.conferencias,ocorrencias:r.ocorrencias,em:new Date().toISOString()};await kvPut("meus",S.meus);schedule();}}catch(e){}
}
let sincronizando=false;
async function sincronizar(){
  if(!temCentral()||sincronizando||!navigator.onLine||!lerSessao()||bloqueado())return;
  sincronizando=true;let enviados=0;
  try{
    S.fila=await filaAll();
    for(const r of S.fila.filter(x=>x.estado!=="recusado"&&x.login===lerSessao().usuario).sort((a,b)=>a.criado_em.localeCompare(b.criado_em))){
      try{
        const res=await chamar(r.tipoReg==="conf"?{acao:"conferencia",conf:r.dados}:{acao:"ocorrencia",oc:r.dados});
        if(res.ok){await filaDel(r.uid);enviados++;}
        else if(res.codigo){r.estado="recusado";r.erro=res.erro;await filaPut(r);}
        else{r.erro=res.erro||"falha";await filaPut(r);break;}
      }catch(e){if(e.sessao)break;r.erro="sem conexão";await filaPut(r);break;}
    }
  }finally{
    sincronizando=false;S.fila=await filaAll();
    if(enviados){toast(enviados+" registro(s) enviado(s) à central.");atualizarMeus();}
    schedule();
  }
}
addEventListener("online",()=>{S.online=true;sincronizar();atualizarDados();schedule();});
addEventListener("offline",()=>{S.online=false;schedule();});
setInterval(()=>{if(document.visibilityState==="visible")sincronizar();},60000);

/* ---------- dados ---------- */
const D=()=>S.dados||{ferramentas:[],kits:[],pecas:[],prazo:7};
const perm=()=>D().ferramentas.filter(t=>t.grupo==="permanente").sort((a,b)=>(a.item||999)-(b.item||999));
const toolById=id=>D().ferramentas.find(t=>t.id===id);
const kitById=id=>D().kits.find(k=>k.id===id);
const kitName=id=>(kitById(id)||{}).nome||"outro kit";
const kitsMeus=()=>D().kits.filter(k=>k.permitido);
const unitByCode=c=>D().pecas.find(u=>u.codigo===c);
const unitsOf=(kitId,toolId)=>D().pecas.filter(u=>u.kit===kitId&&u.situacao!=="baixada"&&(!toolId||u.ferramenta===toolId)).sort((a,b)=>a.codigo.localeCompare(b.codigo));
function normCode(raw){const s=String(raw||"").toUpperCase().replace(/\s+/g,"");const m=s.match(/FER-?(\d{1,6})/);if(m)return "FER-"+m[1].padStart(4,"0");if(/^\d{1,6}$/.test(s))return "FER-"+s.padStart(4,"0");return s;}

/* ---------- telas ---------- */
document.querySelector("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;render();window.scrollTo(0,0);if(S.tab==="meus")atualizarMeus();});
let renderQ=false;
function schedule(){if(renderQ)return;renderQ=true;requestAnimationFrame(()=>{renderQ=false;const a=document.activeElement;
  if(a&&a.matches("input,textarea,select")&&$("main").contains(a)){renderNav();return;}render();});}
function renderNav(){
  document.querySelectorAll("#nav [data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===S.tab)));
  const n=S.fila.length;$("fila-n").innerHTML=n?`<span class="count">${n}</span>`:"";
  const s=lerSessao();$("sub").textContent=s?s.nome+(navigator.onLine?"":" · sem internet"):"Conferência de kit por QR Code";
}
function render(){
  if(!lerSessao()||bloqueado())return;
  renderNav();$("stickyHost").innerHTML="";
  const m=$("main");
  if(!temCentral()){m.innerHTML=`<div class="banner">O aplicativo ainda não está ligado à central. Avise o supervisor.</div>`;return;}
  if(!S.dados){m.innerHTML=`<div class="empty">${navigator.onLine?"Carregando a lista de ferramentas…":"Sem internet. Abra o app com sinal pelo menos uma vez para baixar a lista de ferramentas."}</div>`;return;}
  m.innerHTML=({conferir:vConferir,ocorrencia:vOcorrencia,meus:vMeus})[S.tab]();
  (after[S.tab]||(()=>{}))();
}
const after={};

/* ---------- conferência ---------- */
function novoRascunho(kitId){
  const itens={};for(const t of perm())itens[t.id]={q:t.qtd,s:"ok"};
  return {kitId,tipo:TIPOS_CONF[0],local:ls.get("fer-local",""),obs:"",itens,un:{},alheias:[],aceite:false,sig:null,inicio:new Date().toISOString()};
}
let tRasc=null;
function salvarRascunho(agora){clearTimeout(tRasc);const f=()=>kvPut("rascunho",S.draft).catch(()=>{});if(agora)f();else tRasc=setTimeout(f,400);}
function modelo(d){
  let req=0,done=0,manPend=0;
  const rows=perm().map(t=>{const us=unitsOf(d.kitId,t.id);
    if(!us.length){const it=d.itens[t.id]||(d.itens[t.id]={q:t.qtd,s:"ok"});const p=it.q<t.qtd||it.s!=="ok";if(p)manPend++;return {t,manual:true,it,pend:p};}
    const need=us.filter(u=>u.situacao!=="manutencao"),got=need.filter(u=>d.un[u.codigo]);req+=need.length;done+=got.length;
    const dan=got.some(u=>d.un[u.codigo]==="dan");
    return {t,us,need,got,dan,pend:got.length<need.length||dan};});
  return {rows,req,done,missing:req-done,manPend};
}
function vConferir(){
  const ks=kitsMeus();
  if(!ks.length)return `<div class="empty">Você não está liberado para conferir nenhum kit. Peça ao supervisor para incluir seu usuário no kit.</div>`;
  if(!S.draft||!ks.find(k=>k.id===S.draft.kitId))S.draft=novoRascunho(ks[0].id);
  const d=S.draft,M=modelo(d),temCod=M.rows.some(r=>!r.manual);
  const shown=M.rows.filter(r=>!S.filterPend||r.pend);
  return `<div class="stack">
  ${navigator.onLine?"":`<div class="banner info">Sem internet. Pode conferir normalmente: o registro fica na fila do celular e vai sozinho para a central quando o sinal voltar.</div>`}
  <div><h2>Conferência de kit</h2><p class="lead">Leia o QR Code da etiqueta de cada ferramenta. O que não for lido até o envio fica registrado como <b>faltando</b>.</p></div>
  <div class="field"><span class="label">1. Kit</span><div class="kitpick">${ks.map(k=>`<button type="button" data-kit="${k.id}" aria-pressed="${d.kitId===k.id}"><b>${esc(k.nome)}</b><span>${esc(k.responsavel||"Sem responsável")}${k.local?" · "+esc(k.local):""}</span></button>`).join("")}</div></div>
  <div class="field"><span class="label">2. Tipo de registro</span><div class="seg" id="tipoSeg">${TIPOS_CONF.map(t=>`<button type="button" data-tipo="${esc(t)}" aria-pressed="${d.tipo===t}">${t}</button>`).join("")}</div></div>
  <label class="field">Obra / local de uso<input id="fLocal" value="${esc(d.local)}" placeholder="Ex.: ETE Joinville, cliente X"></label>
  <div class="field"><span class="label">3. Leitura das etiquetas</span>
  ${temCod?`<div class="card stack">
    <button type="button" class="btn primary big" id="bScan">Ler etiquetas com a câmera</button>
    <div class="scanbar"><input id="csIn" placeholder="Ou digite o código (ex.: FER-0012)" autocomplete="off" autocapitalize="characters" enterkeyhint="go" aria-label="Código da etiqueta"><button type="button" class="btn" id="csOk">Confirmar</button></div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${M.req}" aria-valuenow="${M.done}"><i style="width:${M.req?Math.round(100*M.done/M.req):0}%"></i></div>
    <div class="row mini"><span><b class="tnum">${M.done}</b> de <b class="tnum">${M.req}</b> etiquetas lidas</span>${d.alheias.length?`<span class="chip c-warn">${d.alheias.length} de outro kit</span>`:""}<span class="spacer"></span><label class="check" style="align-items:center"><input type="checkbox" id="fPend" ${S.filterPend?"checked":""}>Só o que falta</label></div>
    ${d.alheias.length?`<div class="mini"><b>Lidas de outro kit:</b> ${d.alheias.map(c=>{const u=unitByCode(c);return `${esc(c)} (${esc((toolById(u&&u.ferramenta)||{}).desc||"")}, ${esc(kitName(u&&u.kit))})`;}).join("; ")} <button type="button" class="linkbtn" id="clrAlh">limpar</button></div>`:""}
  </div>`:`<div class="banner">Este kit ainda não tem ferramentas com etiqueta. Confira pela quantidade abaixo.</div>`}
  </div>
  <div class="items" id="items">${shown.length?shown.map(r=>r.manual?itemRow(r.t,r.it):unitBlock(r,d)).join(""):`<div class="empty" style="border:0">Tudo lido. Nenhuma ferramenta faltando.</div>`}</div>
  <label class="field">Observações<textarea id="fObs" placeholder="Algo que o supervisor precise saber">${esc(d.obs)}</textarea></label>
  <div class="field"><span class="label">4. Assinatura de ${esc((lerSessao()||{}).nome||"")}</span>
    <canvas class="sig" id="sig" aria-label="Área de assinatura"></canvas>
    <div class="row"><button type="button" class="btn small" id="sigClear">Apagar assinatura</button><span class="mini">Assine com o dedo.</span></div></div>
  <label class="check"><input type="checkbox" id="fAceite" ${d.aceite?"checked":""}>Declaro que conferi as ferramentas acima e assumo a responsabilidade pela guarda e uso do kit até a próxima conferência.</label>
  </div>`;
}
function unitBlock(r,d){
  const {t,us,need,got}=r;
  return `<div class="item ${r.pend?"pend":""}" data-tool="${t.id}"><span class="n">${String(t.item||"").padStart(2,"0")}</span>
  <div class="d">${esc(t.desc)}<small>${got.length} de ${need.length} lida${need.length>1?"s":""}${us.length>need.length?` · ${us.length-need.length} em manutenção`:""}</small></div>
  <div class="ctl">${got.length===need.length&&!r.dan?`<span class="chip c-ok">Completo</span>`:""}</div>
  <div class="units">${us.map(u=>{const st=d.un[u.codigo];
    if(u.situacao==="manutencao")return `<div class="unit off"><code>${u.codigo}</code><span>Em manutenção</span></div>`;
    if(!st)return `<div class="unit wait"><code>${u.codigo}</code><span>Aguardando leitura</span></div>`;
    return `<div class="unit ${st==="dan"?"dan":"ok"}" data-u="${u.codigo}"><code>${u.codigo}</code><select data-ucond aria-label="Estado de ${u.codigo}"><option value="ok" ${st==="ok"?"selected":""}>Lida · conforme</option><option value="dan" ${st==="dan"?"selected":""}>Lida · danificada</option></select><button type="button" class="linkbtn" data-undo>desfazer</button></div>`;}).join("")}</div></div>`;
}
function itemRow(t,it){
  const p=it.q<t.qtd||it.s!=="ok";
  return `<div class="item ${p?"pend":""}" data-id="${t.id}"><span class="n">${String(t.item||"").padStart(2,"0")}</span>
  <div class="d">${esc(t.desc)}<small>Sem etiqueta · quantidade fixa: ${t.qtd}</small></div>
  <div class="ctl"><div class="step"><button type="button" data-dq="-1" aria-label="Diminuir">−</button><span>${it.q}/${t.qtd}</span><button type="button" data-dq="1" aria-label="Aumentar">+</button></div>
  <select class="cond" data-cond aria-label="Estado">${Object.entries(CONDS).map(([k,v])=>`<option value="${k}" ${it.s===k?"selected":""}>${v}</option>`).join("")}</select></div></div>`;
}
function stickyConf(){
  const d=S.draft;if(!d||!kitsMeus().length)return;const M=modelo(d),falt=M.missing+M.manPend;
  $("stickyHost").innerHTML=`<div class="sticky"><div class="wrap"><div class="mini" style="color:var(--fg)"><b class="tnum">${M.done}</b>/${M.req} lidas${falt?` · <b style="color:var(--bad)">${falt} faltando ou com problema</b>`:` · <b style="color:var(--ok)">kit completo</b>`}</div><span class="spacer"></span><button type="button" class="btn primary" id="sendConf">${M.missing?`Enviar com ${M.missing} faltando`:"Enviar conferência"}</button></div></div>`;
  $("sendConf").onclick=enviarConf;
}
let lastBeep=0,audioCtx=null;
function bip(ok){try{if(navigator.vibrate)navigator.vibrate(ok?60:[60,60,60]);}catch(e){}
  try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=ok?1320:440;g.gain.value=.08;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+(ok?.09:.25));}catch(e){}}
// registra um código lido; devolve {ok,msg,tipo} para a tela do leitor
function lerCodigo(code){
  const d=S.draft;const u=unitByCode(code);
  if(!u)return {tipo:"erro",msg:`${code}: código não cadastrado. Confira a etiqueta.`};
  const t=toolById(u.ferramenta),nome=(t&&t.desc)||"";
  if(u.situacao==="baixada")return {tipo:"erro",msg:`${code} (${nome}) está baixada no cadastro. Avise o supervisor.`};
  if(u.kit!==d.kitId){if(!d.alheias.includes(code))d.alheias.push(code);salvarRascunho();return {tipo:"alerta",msg:`Atenção: ${code} (${nome}) é do ${kitName(u.kit)}.`};}
  if(u.situacao==="manutencao")return {tipo:"alerta",msg:`${code} (${nome}) consta como em manutenção. Avise o supervisor que ela voltou.`};
  if(d.un[code])return {tipo:"repetido",msg:`${code} já foi lida.`};
  d.un[code]="ok";salvarRascunho();
  return {tipo:"ok",msg:`✓ ${code} · ${nome}`};
}
function digitado(){const i=$("csIn");const v=i.value.trim();if(!v)return;i.value="";const r=lerCodigo(normCode(v));bip(r.tipo==="ok");render();toast(r.msg);const n=$("csIn");if(n)n.focus({preventScroll:true});}
after.conferir=()=>{
  const d=S.draft;if(!d)return;stickyConf();
  document.querySelectorAll("[data-kit]").forEach(b=>b.onclick=()=>{if(b.dataset.kit===d.kitId)return;const keep={local:d.local,tipo:d.tipo};S.draft=Object.assign(novoRascunho(b.dataset.kit),keep);salvarRascunho();render();});
  $("tipoSeg").onclick=e=>{const b=e.target.closest("[data-tipo]");if(!b)return;d.tipo=b.dataset.tipo;salvarRascunho();$("tipoSeg").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));};
  $("fLocal").oninput=e=>{d.local=e.target.value;salvarRascunho();};$("fObs").oninput=e=>{d.obs=e.target.value;salvarRascunho();};
  $("fAceite").onchange=e=>{d.aceite=e.target.checked;salvarRascunho();};
  const fp=$("fPend");if(fp)fp.onchange=e=>{S.filterPend=e.target.checked;render();};
  const ca=$("clrAlh");if(ca)ca.onclick=()=>{d.alheias=[];salvarRascunho();render();};
  const bs=$("bScan");if(bs)bs.onclick=()=>abrirLeitor(lerCodigo,()=>{const M=modelo(S.draft);return `${M.done} de ${M.req} etiquetas lidas${S.draft.alheias.length?" · "+S.draft.alheias.length+" de outro kit":""}`;},()=>render());
  const ci=$("csIn");if(ci){ci.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();digitado();}});$("csOk").onclick=digitado;}
  $("items").addEventListener("click",e=>{
    const un=e.target.closest("[data-undo]");if(un){delete d.un[un.closest("[data-u]").dataset.u];salvarRascunho();render();return;}
    const b=e.target.closest("[data-dq]");if(!b)return;const row=b.closest("[data-id]"),t=toolById(row.dataset.id),it=d.itens[t.id];
    it.q=Math.max(0,Math.min(99,it.q+Number(b.dataset.dq)));if(it.q===0&&it.s==="ok")it.s="falta";if(it.q>0&&it.s==="falta")it.s="ok";row.outerHTML=itemRow(t,it);salvarRascunho();stickyConf();});
  $("items").addEventListener("change",e=>{
    const uc=e.target.closest("[data-ucond]");if(uc){d.un[uc.closest("[data-u]").dataset.u]=uc.value;salvarRascunho();render();return;}
    const s=e.target.closest("[data-cond]");if(!s)return;const row=s.closest("[data-id]"),t=toolById(row.dataset.id),it=d.itens[t.id];it.s=s.value;if(s.value==="falta"&&it.q===t.qtd)it.q=Math.max(0,t.qtd-1);row.outerHTML=itemRow(t,it);salvarRascunho();stickyConf();});
  assinatura($("sig"),d);
};
function assinatura(cv,d){
  const ratio=Math.max(1,window.devicePixelRatio||1),r=cv.getBoundingClientRect();cv.width=r.width*ratio;cv.height=r.height*ratio;
  const g=cv.getContext("2d");g.scale(ratio,ratio);g.lineWidth=2.2;g.lineCap="round";g.lineJoin="round";g.strokeStyle="#002B49";
  if(d.sig){const im=new Image();im.onload=()=>g.drawImage(im,0,0,r.width,r.height);im.src=d.sig;}
  let draw=false,last=null,dirty=false;
  const pt=e=>{const b=cv.getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top];};
  cv.onpointerdown=e=>{draw=true;last=pt(e);cv.setPointerCapture(e.pointerId);};
  cv.onpointermove=e=>{if(!draw)return;const p=pt(e);g.beginPath();g.moveTo(...last);g.lineTo(...p);g.stroke();last=p;dirty=true;};
  const end=()=>{if(!draw)return;draw=false;if(dirty){const o=document.createElement("canvas");o.width=420;o.height=Math.round(420*r.height/r.width);const og=o.getContext("2d");og.fillStyle="#FFFFFF";og.fillRect(0,0,o.width,o.height);og.drawImage(cv,0,0,o.width,o.height);d.sig=o.toDataURL("image/jpeg",.7);salvarRascunho();}};
  cv.onpointerup=end;cv.onpointercancel=end;cv.onpointerleave=end;
  $("sigClear").onclick=()=>{g.clearRect(0,0,cv.width,cv.height);d.sig=null;salvarRascunho();};
}
const novoUid=p=>p+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
async function enviarConf(){
  const d=S.draft,s=lerSessao();
  if(!d.sig)return toast("Assine no campo de assinatura.");
  if(!d.aceite)return toast("Marque a declaração de responsabilidade.");
  const M=modelo(d),itens={},pecas={};
  for(const r of M.rows){
    if(r.manual){itens[r.t.id]={q:r.it.q,s:r.it.s};continue;}
    for(const u of r.us)pecas[u.codigo]=u.situacao==="manutencao"?"man":(d.un[u.codigo]||"falta");
    const missing=r.need.length-r.got.length,maint=r.us.length-r.need.length;
    itens[r.t.id]={q:r.got.length,s:r.dan?"dan":missing?"falta":maint?"man":"ok"};
  }
  const pend=perm().filter(t=>itens[t.id]&&(itens[t.id].q<t.qtd||itens[t.id].s!=="ok")).length;
  const uid=novoUid("conf"),agora=new Date().toISOString();
  const reg={uid,tipoReg:"conf",login:s.usuario,criado_em:agora,estado:"fila",
    resumo:{kit_nome:kitName(d.kitId),tipo:d.tipo,local:d.local,lidas:M.done,esperadas:M.req,pendencias:pend,itens,pecas,alheias:[...d.alheias]},
    dados:{uid,criado_em:agora,kit:d.kitId,tipo:d.tipo,local:d.local.trim(),obs:d.obs.trim(),itens,pecas,alheias:[...d.alheias],lidas:M.done,esperadas:M.req,pendencias:pend,assinatura:d.sig.split(",")[1]}};
  try{await filaPut(reg);}catch(e){return toast("Não consegui guardar no celular (memória cheia?). Tente de novo.");}
  ls.set("fer-local",d.local.trim());
  S.draft=null;await kvPut("rascunho",null);S.fila=await filaAll();S.tab="meus";render();window.scrollTo(0,0);
  toast(navigator.onLine?"Conferência salva. Enviando à central…":"Conferência salva no celular. Vai para a central quando houver sinal.",4000);
  sincronizar();
}

/* ---------- leitor de QR pela câmera (leitura contínua) ---------- */
let leitor=null;
function carregarJsQR(){return window.jsQR?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src="lib/jsQR.js";s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
async function decodificarFoto(file){
  const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=URL.createObjectURL(file);});
  try{
    if("BarcodeDetector" in window){try{const r=await new BarcodeDetector({formats:["qr_code"]}).detect(im);if(r[0]&&r[0].rawValue)return r[0].rawValue;}catch(e){}}
    await carregarJsQR();
    for(const max of [1400,900,600]){const s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
      const g=c.getContext("2d");g.drawImage(im,0,0,c.width,c.height);const q=window.jsQR(g.getImageData(0,0,c.width,c.height).data,c.width,c.height,{inversionAttempts:"attemptBoth"});if(q&&q.data)return q.data;}
    return null;
  }finally{URL.revokeObjectURL(im.src);}
}
function mostrarLeitura(r){const el=$("sc-ultimo");el.textContent=r.msg;el.className="ultimo"+(r.tipo==="erro"?" erro":r.tipo==="alerta"?" alerta":"");
  if(leitor&&leitor.conta)$("sc-conta").textContent=leitor.conta();
  if(r.tipo==="ok"){$("sc-mira").classList.add("hit");setTimeout(()=>$("sc-mira").classList.remove("hit"),350);}}
async function abrirLeitor(aoLer,conta,aoFechar){
  leitor={aoLer,conta,aoFechar,ultimo:"",ultimoEm:0,stream:null,parar:false};
  $("scanner").hidden=false;$("sc-conta").textContent=conta?conta():"";$("sc-ultimo").textContent="Abrindo a câmera…";$("sc-ultimo").className="ultimo";
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$("sc-ultimo").textContent="Este celular não permite a câmera ao vivo aqui. Toque em Usar foto.";return;}
  try{
    leitor.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){$("sc-ultimo").textContent="Não consegui abrir a câmera. Libere a câmera para este app nas configurações do navegador, ou toque em Usar foto.";$("sc-ultimo").className="ultimo erro";return;}
  if(!leitor||leitor.parar){leitor&&leitor.stream&&leitor.stream.getTracks().forEach(t=>t.stop());return;}
  const v=$("sc-video");v.srcObject=leitor.stream;try{await v.play();}catch(e){}
  $("sc-ultimo").textContent="Leitura contínua: passe as etiquetas uma a uma.";
  const track=leitor.stream.getVideoTracks()[0];
  try{const cap=track.getCapabilities&&track.getCapabilities();if(cap&&cap.torch){$("sc-luz").hidden=false;let on=false;$("sc-luz").onclick=()=>{on=!on;track.applyConstraints({advanced:[{torch:on}]}).catch(()=>{});};}}catch(e){}
  let det=null;if("BarcodeDetector" in window){try{det=new BarcodeDetector({formats:["qr_code"]});}catch(e){det=null;}}
  if(!det){try{await carregarJsQR();}catch(e){$("sc-ultimo").textContent="Não consegui carregar o leitor. Toque em Usar foto ou digite o código.";return;}}
  const c=document.createElement("canvas"),g=c.getContext("2d",{willReadFrequently:true});
  const passo=async()=>{
    if(!leitor||leitor.parar)return;
    if(v.readyState>=2&&v.videoWidth){
      let txt=null;
      try{
        if(det){const r=await det.detect(v);if(r[0])txt=r[0].rawValue;}
        else{const lado=Math.min(v.videoWidth,v.videoHeight)*.8,s=Math.min(1,640/lado);c.width=Math.round(lado*s);c.height=c.width;
          g.drawImage(v,(v.videoWidth-lado)/2,(v.videoHeight-lado)/2,lado,lado,0,0,c.width,c.height);
          const q=window.jsQR(g.getImageData(0,0,c.width,c.height).data,c.width,c.height,{inversionAttempts:"dontInvert"});if(q)txt=q.data;}
      }catch(e){}
      if(txt){const code=normCode(txt),t=Date.now();
        if(code!==leitor.ultimo||t-leitor.ultimoEm>2500){leitor.ultimo=code;leitor.ultimoEm=t;const r=leitor.aoLer(code);if(r.tipo!=="repetido"||t-lastBeep>1500){bip(r.tipo==="ok");lastBeep=t;}mostrarLeitura(r);}}
    }
    setTimeout(()=>requestAnimationFrame(passo),120);
  };
  passo();
}
function fecharLeitor(){
  if(!leitor)return;leitor.parar=true;if(leitor.stream)leitor.stream.getTracks().forEach(t=>t.stop());
  $("sc-video").srcObject=null;$("scanner").hidden=true;$("sc-luz").hidden=true;const f=leitor.aoFechar;leitor=null;marcarUso(true);if(f)f();
}
$("sc-fechar").onclick=fecharLeitor;
$("sc-foto").onclick=()=>$("sc-file").click();
$("sc-file").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;
  const usar=leitor?leitor.aoLer:(S.tab==="conferir"?lerCodigo:null);
  try{const v=await decodificarFoto(f);if(!v){const r={tipo:"erro",msg:"Não encontrei QR Code na foto. Aproxime a câmera da etiqueta ou digite o código."};leitor?mostrarLeitura(r):toast(r.msg);return;}
    const r=usar?usar(normCode(v)):{tipo:"ok",msg:normCode(v)};bip(r.tipo==="ok");leitor?mostrarLeitura(r):(toast(r.msg),render());}
  catch(err){toast("Não consegui ler a foto. Digite o código da etiqueta.");}
};

/* ---------- ocorrência ou pedido ---------- */
function vOcorrencia(){
  const o=S.oc,ks=D().kits;if(!o.kitId)o.kitId=(kitsMeus()[0]||ks[0]||{}).id||"";if(!o.tipo)o.tipo=TIPOS_OC[0];if(o.qtd==null)o.qtd=1;
  const grupos=[["permanente","Ferramentas do kit"],["almox","Retirar no almoxarifado"],["individual","Itens individuais"]];
  const u=o.codigo&&unitByCode(o.codigo);
  return `<div class="stack"><div><h2>Ocorrência ou pedido</h2><p class="lead">Registre quebra, perda, furto ou envio para manutenção, ou peça material do almoxarifado.</p></div>
  <div class="card stack">
   <div class="field"><span class="label">Etiqueta da ferramenta (se tiver)</span>
    <div class="scanbar"><button type="button" class="btn primary" id="oScan">Ler etiqueta</button><input id="osIn" placeholder="Ou digite o código" autocomplete="off" autocapitalize="characters" enterkeyhint="go" aria-label="Código da etiqueta"><button type="button" class="btn" id="osOk">Confirmar</button></div>
    ${u?`<div class="row mini"><span class="chip c-info">${esc(o.codigo)}</span><span>${esc((toolById(u.ferramenta)||{}).desc||"")} · ${esc(kitName(u.kit))}</span><button type="button" class="linkbtn" id="oClr">remover</button></div>`:`<span class="mini">Ler a etiqueta preenche a ferramenta e o kit.</span>`}</div>
   <div class="fields">
    <label class="field">Kit<select id="oKit">${ks.map(k=>`<option value="${k.id}" ${o.kitId===k.id?"selected":""}>${esc(k.nome)}${k.responsavel?" · "+esc(k.responsavel):""}</option>`).join("")}</select></label>
    <label class="field">Tipo<select id="oTipo">${TIPOS_OC.map(t=>`<option ${o.tipo===t?"selected":""}>${t}</option>`).join("")}</select></label>
   </div>
   <div class="fields">
    <label class="field">Ferramenta ou material<select id="oTool"><option value="">Selecione…</option>${grupos.map(([g,l])=>`<optgroup label="${l}">${D().ferramentas.filter(t=>t.grupo===g).sort((a,b)=>(a.item||999)-(b.item||999)).map(t=>`<option value="${t.id}" ${o.toolId===t.id?"selected":""}>${t.item?t.item+" · ":""}${esc(t.desc)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <label class="field">Quantidade<input id="oQtd" type="number" min="1" max="99" inputmode="numeric" value="${o.qtd}"></label>
   </div>
   <label class="field">Descrição<textarea id="oDesc" placeholder="O que aconteceu, onde e quando">${esc(o.desc||"")}</textarea></label>
   <div class="field"><span class="label">Foto (opcional)</span><input id="oFoto" type="file" accept="image/*" capture="environment">${o.foto?`<img class="photo" alt="Foto anexada" src="${o.foto}"><button type="button" class="linkbtn" id="oFotoRm" style="align-self:flex-start">remover foto</button>`:""}</div>
   <div class="row"><span class="spacer"></span><button type="button" class="btn primary big" id="oSend">Registrar</button></div>
  </div></div>`;
}
function encolher(file){return new Promise((ok,no)=>{const img=new Image();img.onload=()=>{const s=Math.min(1,1280/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);ok(c.toDataURL("image/jpeg",.78));};img.onerror=no;img.src=URL.createObjectURL(file);});}
function codigoOc(code){const u=unitByCode(code);if(!u){toast(`Código ${code} não cadastrado.`);return {tipo:"erro",msg:`Código ${code} não cadastrado.`};}
  Object.assign(S.oc,{codigo:code,toolId:u.ferramenta,kitId:u.kit,qtd:1});return {tipo:"ok",msg:`✓ ${code} · ${(toolById(u.ferramenta)||{}).desc||""}`};}
after.ocorrencia=()=>{
  const o=S.oc;
  $("oKit").onchange=e=>o.kitId=e.target.value;$("oTipo").onchange=e=>o.tipo=e.target.value;
  $("oTool").onchange=e=>{o.toolId=e.target.value;if(o.codigo&&(unitByCode(o.codigo)||{}).ferramenta!==o.toolId){o.codigo=null;render();}};
  $("oQtd").oninput=e=>o.qtd=Number(e.target.value);$("oDesc").oninput=e=>o.desc=e.target.value;
  $("oScan").onclick=()=>abrirLeitor(code=>{const r=codigoOc(code);if(r.tipo==="ok")setTimeout(fecharLeitor,500);return r;},null,()=>render());
  const go=()=>{const v=$("osIn").value.trim();if(!v)return;const r=codigoOc(normCode(v));if(r.tipo==="ok"){render();toast(r.msg);}};
  $("osIn").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go();}});$("osOk").onclick=go;
  const c=$("oClr");if(c)c.onclick=()=>{o.codigo=null;render();};
  const fr=$("oFotoRm");if(fr)fr.onclick=()=>{o.foto=null;render();};
  $("oFoto").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{o.foto=await encolher(f);render();}catch(err){toast("Não consegui usar a foto.");}};
  $("oSend").onclick=async()=>{
    if(!o.toolId)return toast("Selecione a ferramenta ou o material.");
    if(!o.kitId)return toast("Selecione o kit.");
    const s=lerSessao(),t=toolById(o.toolId),uid=novoUid("oc"),agora=new Date().toISOString();
    const reg={uid,tipoReg:"oc",login:s.usuario,criado_em:agora,estado:"fila",
      resumo:{tipo:o.tipo,ferramenta_desc:t?t.desc:"",codigo:o.codigo||"",qtd:Math.max(1,o.qtd||1),descricao:(o.desc||"").trim(),kit_nome:kitName(o.kitId)},
      dados:{uid,criado_em:agora,kit:o.kitId,tipo:o.tipo,ferramenta:o.toolId,codigo:o.codigo||"",qtd:Math.max(1,o.qtd||1),descricao:(o.desc||"").trim(),foto:o.foto?o.foto.split(",")[1]:""}};
    try{await filaPut(reg);}catch(e){return toast("Não consegui guardar no celular. Tente sem a foto.");}
    S.oc={kitId:o.kitId};S.fila=await filaAll();S.tab="meus";render();window.scrollTo(0,0);
    toast(navigator.onLine?"Ocorrência salva. Enviando à central…":"Ocorrência salva no celular. Vai para a central quando houver sinal.",4000);
    sincronizar();
  };
};

/* ---------- meus registros ---------- */
function linhasPend(itens,pecas){
  const out=[];for(const t of perm()){const it=itens&&itens[t.id];if(!it)continue;if(it.q<t.qtd||it.s!=="ok"){
    const cods=pecas?Object.entries(pecas).filter(([k,v])=>v!=="ok"&&(unitByCode(k)||{}).ferramenta===t.id).map(([k,v])=>`${k} ${v==="falta"?"faltando":v==="dan"?"danificada":"em manutenção"}`):[];
    out.push(`<li>${esc(t.desc)}: ${it.q}/${t.qtd} · ${CONDS[it.s]||it.s}${cods.length?" ("+esc(cods.join(", "))+")":""}</li>`);}}
  return out;
}
function cartaoConf(c,estado,extra){
  const [st,cls]=estado;const pend=linhasPend(c.itens,c.pecas);
  return `<div class="rec"><div class="row"><h3>${esc(c.tipo)} · ${esc(c.kit_nome)}</h3><span class="spacer"></span><span class="chip ${cls}">${st}</span></div>
  <div class="meta">${fmtDate(c.criado_em)}${c.local?" · "+esc(c.local):""} · ${c.lidas} de ${c.esperadas} etiquetas lidas</div>
  ${pend.length?`<div><span class="chip c-warn">${pend.length} pendência${pend.length>1?"s":""}</span>${pend.length<=8?`<ul class="diffs">${pend.join("")}</ul>`:`<ul class="diffs">${pend.slice(0,6).join("")}</ul><details><summary>Ver mais ${pend.length-6}</summary><ul class="diffs">${pend.slice(6).join("")}</ul></details>`}</div>`:`<div><span class="chip c-ok">Kit completo</span></div>`}
  ${c.alheias&&c.alheias.length?`<div class="mini">Peças de outro kit: ${esc(c.alheias.join(", "))}</div>`:""}
  ${c.comentario?`<div class="mini"><b>Supervisor:</b> ${esc(c.comentario)}</div>`:""}${extra||""}</div>`;
}
function cartaoOc(o,estado,extra){
  const [st,cls]=estado;
  return `<div class="rec"><div class="row"><h3>${esc(o.tipo)}</h3><span class="spacer"></span><span class="chip ${cls}">${st}</span></div>
  <div>${o.codigo?`<code class="k">${esc(o.codigo)}</code> · `:""}<b>${esc(o.ferramenta_desc)}</b> · qtd ${o.qtd} · ${esc(o.kit_nome||"")}</div>
  <div class="meta">${fmtDate(o.criado_em)}</div>${o.descricao?`<div class="mini">${esc(o.descricao)}</div>`:""}
  ${o.comentario?`<div class="mini"><b>Supervisor:</b> ${esc(o.comentario)}</div>`:""}${extra||""}</div>`;
}
function vMeus(){
  const s=lerSessao(),fila=S.fila.filter(f=>f.login===s.usuario).sort((a,b)=>b.criado_em.localeCompare(a.criado_em));
  const m=S.meus||{conferencias:[],ocorrencias:[]};
  const cent=[...m.conferencias.map(c=>({k:"c",x:c})),...m.ocorrencias.map(o=>({k:"o",x:o}))].sort((a,b)=>b.x.criado_em.localeCompare(a.x.criado_em));
  const fEstado=f=>f.estado==="recusado"?["Recusado pela central","c-bad"]:["Aguardando envio","c-warn"];
  const fExtra=f=>f.estado==="recusado"?`<div class="mini" style="color:var(--bad)">${esc(f.erro||"")}</div><button type="button" class="linkbtn" data-rm="${f.uid}" style="align-self:flex-start">Excluir do celular</button>`:(f.erro?`<div class="mini">Última tentativa: ${esc(f.erro)}</div>`:"");
  return `<div class="stack"><div class="row"><div><h2>Meus registros</h2><p class="lead" style="margin:0">Suas conferências e ocorrências dos últimos 90 dias, com a resposta do supervisor.</p></div><span class="spacer"></span>${fila.length?`<button type="button" class="btn small" id="bSync">Enviar agora</button>`:""}</div>
  ${fila.length?`<div class="stack"><h3>No celular, aguardando envio (${fila.length})</h3><div class="list">${fila.map(f=>f.tipoReg==="conf"?cartaoConf({...f.resumo,criado_em:f.criado_em},fEstado(f),fExtra(f)):cartaoOc({...f.resumo,criado_em:f.criado_em},fEstado(f),fExtra(f))).join("")}</div></div>`:""}
  <div class="stack"><h3>Na central${m.em?` <span class="mini">(atualizado ${fmtDate(m.em)})</span>`:""}</h3>
  ${cent.length?`<div class="list">${cent.slice(0,80).map(({k,x})=>k==="c"?cartaoConf(x,ST_CONF[x.status]||ST_CONF.pendente):cartaoOc(x,ST_OC[x.status]||ST_OC.aberta)).join("")}</div>`:`<div class="empty">${S.meus?"Nenhum registro ainda. Comece pela aba Conferir kit.":navigator.onLine?"Carregando…":"Sem internet. Os registros da central aparecem quando houver sinal."}</div>`}</div></div>`;
}
after.meus=()=>{
  const b=$("bSync");if(b)b.onclick=()=>sincronizar();
  document.querySelectorAll("[data-rm]").forEach(x=>x.onclick=async()=>{if(x.dataset.c!=="1"){x.dataset.c="1";x.textContent="Toque de novo para excluir";return;}await filaDel(x.dataset.rm);S.fila=await filaAll();render();});
};

/* ---------- instalar na tela inicial ---------- */
let pedidoInstalar=null;
const instalado=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const ehIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function mostrarInstalar(forcar){
  if(instalado()){$("instalar").hidden=true;$("b-instalar-rodape").hidden=true;return;}
  $("b-instalar-rodape").hidden=false;
  if(!forcar&&Date.now()<ls.get("fer-instalar-adiado",0))return;
  const como=$("instalar-como"),b=$("b-instalar");
  if(pedidoInstalar){como.textContent="Fica com ícone na tela inicial, abre mais rápido e funciona sem internet.";b.hidden=false;}
  else if(ehIOS()){como.innerHTML="No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>.";b.hidden=true;}
  else{como.innerHTML="Abra o menu do navegador (<b>⋮</b>) e toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.";b.hidden=true;}
  $("instalar").hidden=false;
}
addEventListener("beforeinstallprompt",e=>{e.preventDefault();pedidoInstalar=e;mostrarInstalar(false);});
addEventListener("appinstalled",()=>{pedidoInstalar=null;$("instalar").hidden=true;$("b-instalar-rodape").hidden=true;toast("Aplicativo instalado.");});
$("b-instalar").onclick=async()=>{if(!pedidoInstalar){mostrarInstalar(true);return;}pedidoInstalar.prompt();try{const r=await pedidoInstalar.userChoice;if(r&&r.outcome==="accepted")$("instalar").hidden=true;}catch(e){}pedidoInstalar=null;};
$("b-instalar-nao").onclick=()=>{ls.set("fer-instalar-adiado",Date.now()+7*864e5);$("instalar").hidden=true;};
$("b-instalar-rodape").onclick=()=>{mostrarInstalar(true);window.scrollTo({top:0,behavior:"smooth"});};
setTimeout(()=>mostrarInstalar(false),2500);
if("serviceWorker" in navigator&&location.protocol==="https:"){
  const tinha=!!navigator.serviceWorker.controller;let recarregou=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(tinha&&!recarregou){recarregou=true;salvarRascunho(true);setTimeout(()=>location.reload(),200);}});
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>{r.update();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")r.update();});}).catch(()=>{});
}

/* ---------- início ---------- */
$("versao").textContent="Versão "+VERSAO;
(async()=>{
  try{S.dados=await kvGet("dados")||null;}catch(e){}
  try{S.meus=await kvGet("meus")||null;}catch(e){}
  try{const r=await kvGet("rascunho");if(r)S.draft=r;}catch(e){}
  try{S.fila=await filaAll();}catch(e){S.fila=[];}
  if(!lerSessao())mostrarLogin("");
  else if(bloqueado()||Date.now()-ls.get("fer-ultimo-uso",Date.now())>=INATIVO_MS)bloquearApp();
  else{marcarUso(true);esconderLogin();}
  atualizarDados();sincronizar();atualizarMeus();
  setInterval(()=>{if(document.visibilityState==="visible")atualizarDados();},10*60*1000);
})();
})();
