(function(){
"use strict";
const VERSAO="27/10/2026 22:10";
const $=id=>document.getElementById(id);
const CLIMAS=["☀️ Bom","⛅ Nublado","🌧️ Chuva","⛈️ Impraticável"];
const MO=[["m_lid","Líder"],["m_mon","Montador"],["m_aux","Auxiliar"],["m_out","Outros"]];
const FIELDS=["idobra","obra","local","data","rdo","resp","hini","hfim","ativ","equip","mat","ocor","obs",...MO.map(m=>m[0])];
const clima={manha:"",tarde:""};
let registros=[], editId=null, fotos=[], envio=null, assinatura="";

/* ---------- banco local (IndexedDB) ---------- */
let dbp=null;
function idb(){
  if(dbp)return dbp;
  dbp=new Promise((ok,no)=>{
    const rq=indexedDB.open("diario-obra-ectas",1);
    rq.onupgradeneeded=()=>{const d=rq.result;d.createObjectStore("registros",{keyPath:"_id"});d.createObjectStore("rascunho");};
    rq.onsuccess=()=>ok(rq.result);rq.onerror=()=>no(rq.error);
  });
  return dbp;
}
async function tx(store,mode,fn){
  const d=await idb();
  return new Promise((ok,no)=>{
    const t=d.transaction(store,mode),s=t.objectStore(store);let out;
    Promise.resolve(fn(s)).then(r=>{out=r;});
    t.oncomplete=()=>ok(out&&out.result!==undefined?out.result:out);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error);
  });
}
const dbAll=()=>tx("registros","readonly",s=>s.getAll());
const dbPut=r=>tx("registros","readwrite",s=>{s.put(r);});
const dbDel=id=>tx("registros","readwrite",s=>{s.delete(id);});
const draftGet=()=>tx("rascunho","readonly",s=>s.get("atual"));
const draftPut=d=>tx("rascunho","readwrite",s=>{s.put(d,"atual");});
async function carregar(){try{registros=await dbAll()||[];}catch(e){registros=[];}await limparAntigos();montarCanon(registros);render();}

/* ---------- utilidades ---------- */
function hoje(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);}
function fmtData(s){if(!s)return"";const[y,m,d]=s.split("-");const dias=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];return `${d}/${m}/${y} (${dias[new Date(+y,+m-1,+d).getDay()]})`;}
function esc(s){const d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML;}
function total(r){return MO.reduce((s,[k])=>s+(parseInt(r[k])||0),0);}
function linhas(t){return (t||"").split(/\n+/).map(s=>s.trim()).filter(Boolean).map(s=>"- "+s.replace(/^[-•*]\s*/,"")).join("\n");}
const semIcone=t=>(t||"").replace(/^[^\p{L}]+/u,"");
function nomeArq(base,ext){return (base.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"_")||"diario")+"."+ext;}
function msg(t,err){const m=$("msg");m.textContent=t;m.className="msg"+(err?" err":"");}
function msgExp(t,err){const m=$("msg-exp");m.textContent=t;m.className="msg"+(err?" err":"");}
function pfMsg(t,err){const m=$("pf-msg");m.textContent=t;m.className="msg"+(err?" err":"");}
const norm=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toUpperCase();
// a obra é identificada pelo ID; sem ID, pelo nome sem diferença de maiúsculas, acentos e espaços
function obraChave(r){const id=norm(r.idobra);return id?"ID:"+id:"NOME:"+norm(r.obra);}
let canon={};
function montarCanon(lista){
  // para cada obra, usa o nome e o local mais usados (em empate, o mais recente)
  const g={};
  lista.slice().sort((a,b)=>String(a.data||"").localeCompare(String(b.data||""))).forEach(r=>{
    const k=obraChave(r),x=g[k]=g[k]||{id:"",nomes:{},locais:{}};
    if(String(r.idobra??"").trim())x.id=String(r.idobra).trim();
    const conta=(m,v)=>{v=String(v||"").trim().replace(/\s+/g," ");if(!v)return;const n=norm(v);const e=m[n]=m[n]||{c:0,grafias:{}};e.c++;e.grafias[v]=(e.grafias[v]||0)+1;};
    conta(x.nomes,r.obra);conta(x.locais,r.local);
  });
  // grafia mais usada; no empate, a do primeiro cadastro
  const top=m=>{let b=null;Object.values(m).forEach(v=>{if(!b||v.c>b.c)b=v;});if(!b)return"";let t="",c=0;Object.entries(b.grafias).forEach(([g,n])=>{if(n>c){t=g;c=n;}});return t;};
  canon={};Object.entries(g).forEach(([k,x])=>canon[k]={idobra:x.id,obra:top(x.nomes),local:top(x.locais)});
}
function obraNome(r){const c=canon[obraChave(r)]||r;return [c.idobra,c.obra].filter(Boolean).join(" - ")+(c.local?" / "+c.local:"");}
function lerContadores(){try{return JSON.parse(localStorage.getItem("rdo-contadores")||"{}");}catch(e){return {};}}
function gravarContador(ref){try{const c=lerContadores(),k=obraChave(ref),n=parseInt(ref.rdo)||0;if(n>(c[k]||0)){c[k]=n;localStorage.setItem("rdo-contadores",JSON.stringify(c));}}catch(e){}}
// próximo nº: maior entre os RDOs do celular, o último usado aqui e o último que chegou à central
function proxRdo(ref){
  const k=obraChave(ref);
  const n=registros.filter(r=>obraChave(r)===k&&r._id!==editId).map(r=>parseInt(r.rdo)||0);
  const central=(listaObras.find(o=>obraChave({idobra:o.id,obra:o.obra})===k)||{}).ultimoRdo||0;
  return Math.max(0,...n,lerContadores()[k]||0,parseInt(central)||0)+1;
}
function abrirWa(t){location.href="https://wa.me/?text="+encodeURIComponent(t);}
function baixarArquivo(blob,nome){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}

/* ---------- formulário ---------- */
document.querySelectorAll(".clima").forEach(box=>{
  const k=box.dataset.k,w=box.querySelector(".chips");
  CLIMAS.forEach(c=>{const b=document.createElement("button");b.type="button";b.className="chip";b.textContent=c;b.setAttribute("aria-pressed","false");
    b.onclick=()=>{clima[k]=clima[k]===c?"":c;paintClima();update();};w.appendChild(b);});
});
function paintClima(){document.querySelectorAll(".clima").forEach(box=>box.querySelectorAll(".chip").forEach(b=>b.setAttribute("aria-pressed",String(b.textContent===clima[box.dataset.k]))));}
function lerForm(){
  const r={};FIELDS.forEach(f=>r[f]=$(f).value.trim());
  r.clima_manha=clima.manha;r.clima_tarde=clima.tarde;
  r.fotos=fotos.map(f=>({blob:f.blob,desc:(f.desc||"").trim()}));
  r.assinatura=assinatura||"";
  return r;
}
function preencher(r){
  FIELDS.forEach(f=>$(f).value=r[f]||"");
  if(!$("hini").value)$("hini").value="07:00";if(!$("hfim").value)$("hfim").value="17:00";
  clima.manha=r.clima_manha||"";clima.tarde=r.clima_tarde||"";
  fotos=(r.fotos||[]).filter(f=>f&&f.blob).map(f=>({blob:f.blob,desc:f.desc||"",url:URL.createObjectURL(f.blob)}));
  paintClima();renderFotos();
  definirAssinatura(r.assinatura||"");
}
let tSalvar=null;
function update(){
  $("mtot").textContent=total(lerForm());mostrarBotaoCopiar();
  clearTimeout(tSalvar);tSalvar=setTimeout(()=>{draftPut({...lerForm(),editId}).catch(()=>{});},400);
}
function validar(){
  const falta=[];
  if(!lerSessao()){mostrarLogin("Entre com seu usuário para salvar o RDO.");return false;}
  if(!$("selobra").value){msg(listaObras.length?"Escolha a obra na lista.":"Nenhuma obra liberada para você. Fale com o supervisor.",true);$("selobra").focus();return false;}
  if(!$("obra").value.trim())falta.push("obra");
  if(!$("data").value)falta.push("data");
  if(!$("resp").value.trim())falta.push("responsável");
  if(!$("ativ").value.trim())falta.push("atividades executadas");
  if(falta.length){msg("Preencha: "+falta.join(", ")+".",true);return false;}
  if(!assinatura){msg("Assine o RDO no campo Assinatura do encarregado (no fim do formulário).",true);$("ass-box").classList.add("err");$("ass-box").scrollIntoView({behavior:"smooth",block:"center"});return false;}
  const dup=rdoDoDiaLocal($("idobra").value,$("data").value,editId);
  if(dup){msg("Já existe o RDO nº "+(dup.rdo||"-")+" desta obra em "+fmtData(dup.data)+" ("+(dup.resp||"")+"), salvo neste celular. Só pode haver um RDO por obra em cada dia. Para corrigir, edite o RDO existente no Histórico.",true);$("data").focus();return false;}
  return true;
}
// regra: um único RDO por obra (ID) em cada dia
function rdoDoDiaLocal(idobra,data,ignorar){
  const k=norm(idobra);if(!k||!data)return null;
  return registros.find(x=>x._id!==ignorar&&x.central!=="recusado"&&norm(x.idobra)===k&&x.data===data)||null;
}
async function verificarDiaCentral(r,uid){
  if(!temCentral()||!navigator.onLine||!lerSessao())return null;
  try{
    const res=await Promise.race([postCentral({acao:"verificarDia",idobra:r.idobra,data:r.data,uid}),new Promise((_,no)=>setTimeout(()=>no(new Error("tempo")),8000))]);
    return res&&res.existe||null;
  }catch(e){return null;}   // sem resposta: a central confere de novo no envio
}
function limpar(){
  FIELDS.forEach(f=>{if(!["resp","idobra","obra","local","hini","hfim"].includes(f))$(f).value="";});
  $("data").value=hoje();clima.manha="";clima.tarde="";editId=null;fotos=[];renderFotos();paintClima();definirAssinatura("");update();
}
$("f").addEventListener("input",update);
$("idobra").addEventListener("change",()=>{
  const id=$("idobra").value.trim();if(!id)return;
  const c=canon["ID:"+norm(id)];
  // mesmo ID = mesma obra: usa o nome e o local já cadastrados
  if(c){$("idobra").value=c.idobra||id;if(c.obra)$("obra").value=c.obra;if(c.local)$("local").value=c.local;update();msg("Obra encontrada pelo ID: "+obraNome({idobra:id})+".");}
});
$("f").addEventListener("submit",e=>e.preventDefault());

/* ---------- fotos ---------- */
function reduzir(file){
  return new Promise((ok,no)=>{
    const u=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      const max=1600,s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);
      c.toBlob(b=>b?ok(b):no(new Error("falha ao processar")),"image/jpeg",0.8);
    };
    img.onerror=()=>{URL.revokeObjectURL(u);no(new Error("arquivo não é uma imagem"));};
    img.src=u;
  });
}
async function addFotos(list){
  for(const file of list){
    try{const blob=await reduzir(file);fotos.push({blob,desc:"",url:URL.createObjectURL(blob)});}
    catch(e){msg("Não consegui abrir uma das fotos ("+e.message+").",true);}
  }
  renderFotos();update();
  const ult=$("fd-"+(fotos.length-1));if(ult)ult.focus();
}
function renderFotos(){
  $("fotos").innerHTML=fotos.map((f,i)=>`
    <div class="foto" data-i="${i}">
      <div class="img"><img src="${esc(f.url)}" alt="Foto ${i+1}"><span class="n">${i+1}</span></div>
      <textarea id="fd-${i}" data-i="${i}" placeholder="Legenda: o que mostra esta foto?">${esc(f.desc)}</textarea>
      <div class="ft"><button type="button" class="btn sec" data-fa="rm">Remover</button></div>
    </div>`).join("");
  const n=fotos.length;
  $("foto-info").textContent=n?`${n} foto${n>1?"s":""}. Escreva a legenda de cada uma; ela sai embaixo da foto no PDF.`:"Tire as fotos e escreva a legenda de cada uma (local, serviço, estaca ou trecho).";
}
$("cam").onchange=e=>{addFotos([...e.target.files]);e.target.value="";};
$("gal").onchange=e=>{addFotos([...e.target.files]);e.target.value="";};
$("fotos").addEventListener("input",e=>{const t=e.target.closest("textarea[data-i]");if(t){fotos[+t.dataset.i].desc=t.value;update();}e.stopPropagation();});
$("fotos").addEventListener("click",e=>{
  const b=e.target.closest("button[data-fa]");if(!b)return;
  const i=+b.closest(".foto").dataset.i;
  if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent="Confirmar remoção";return;}
  fotos.splice(i,1);renderFotos();update();
});

/* ---------- regras do histórico ---------- */
const PRAZO_MS=48*3600*1000;   // histórico e edição: 48 horas
function criadoEm(r){
  if(r.criadoEm)return new Date(r.criadoEm).getTime();
  const m=/^rdo-(\d{12,})/.exec(r._id||"");if(m)return +m[1];
  return new Date(r.salvoEm||Date.now()).getTime();
}
const dentroPrazo=r=>Date.now()-criadoEm(r)<=PRAZO_MS;
/* ---------- sessão do encarregado (usuário e senha cadastrados pelo supervisor) ---------- */
function lerSessao(){try{return JSON.parse(localStorage.getItem("sessao")||"null");}catch(e){return null;}}
function gravarSessao(s){try{if(s)localStorage.setItem("sessao",JSON.stringify(s));else localStorage.removeItem("sessao");}catch(e){}}
const lerPerfil=()=>(lerSessao()||{}).nome||"";
const meuLogin=()=>(lerSessao()||{}).usuario||"";
// RDO é do usuário logado (RDOs antigos, sem login, comparam pelo nome)
const doResponsavel=r=>{const s=lerSessao();if(!s)return false;return r.usuario?r.usuario===s.usuario:norm(r.resp)===norm(s.nome);};
const podeEditar=r=>dentroPrazo(r)&&doResponsavel(r);
function motivoBloqueio(r){
  if(!doResponsavel(r))return "Registro de outro responsável";
  if(!dentroPrazo(r))return "Edição encerrada (48 h)";
  return "";
}
function aplicarPerfil(){
  if(typeof nomeAssinatura==="function")nomeAssinatura();
  const s=lerSessao(),i=$("resp");
  i.value=s?s.nome:"";i.readOnly=true;
  $("perfil-info").hidden=!s;$("b-sair-top").hidden=!s||!$("v-entrar").hidden;
  if(s)$("perfil-nome").textContent=s.nome+" ("+s.usuario+")";
}
function mostrarLogin(motivo){
  $("b-sair-top").hidden=true;modoBloqueio(false);
  $("v-entrar").hidden=false;["nav-tabs","v-novo","v-hist","v-painel"].forEach(id=>{const e=$(id);if(e)e.hidden=true;});
  try{if(!motivo&&localStorage.getItem("sessao-msg"))motivo=MSG_SESSAO;localStorage.removeItem("sessao-msg");}catch(e){}
  $("l-msg").textContent=motivo||"";$("l-msg").className="msg"+(motivo?" err":"");
  const u=$("l-usuario");if(!u.value)u.value=(lerSessao()||{}).usuario||localStorage.getItem("ultimo-usuario")||"";
  setTimeout(()=>{if(typeof preencherSenhaSalva==="function")preencherSenhaSalva();},0);
}
function esconderLogin(){$("v-entrar").hidden=true;$("nav-tabs").hidden=false;tab(false);aplicarPerfil();}
$("f-entrar").addEventListener("submit",async e=>{
  e.preventDefault();
  const usuario=$("l-usuario").value.trim().toLowerCase(),senha=$("l-senha").value;
  if(!usuario||!senha){$("l-msg").textContent="Digite o usuário e a senha.";$("l-msg").className="msg err";return;}
  if(bloqueado()&&!navigator.onLine){
    // sem sinal: confere a senha com o registro guardado neste celular no último login
    if(await senhaLocalOk(usuario,senha)){if($("l-lembrar").checked)await lembrarSenha(usuario,senha);else esquecerSenha();$("l-senha").value="";desbloquear();msg("App desbloqueado.");}
    else{$("l-msg").textContent="Senha incorreta.";$("l-msg").className="msg err";$("l-senha").value="";}
    return;
  }
  if(!navigator.onLine){$("l-msg").textContent="Para entrar é preciso internet. Depois o app funciona sem sinal.";$("l-msg").className="msg err";return;}
  const b=$("b-entrar-app");b.disabled=true;$("l-msg").textContent="Entrando…";$("l-msg").className="msg";
  try{
    const r=await fetch(CENTRAL.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({acao:"login",usuario,senha,chave:CENTRAL.chave})});
    const res=await r.json();
    if(!res.ok){
      const d=temSenhaSalva();
      if(d&&d.u===usuario&&/incorret/i.test(res.erro||"")){esquecerSenha();$("l-lembrar").checked=false;$("l-senha").value="";
        throw new Error("A senha salva não vale mais (o supervisor pode ter trocado). Digite a senha nova.");}
      throw new Error(res.erro||"Não consegui entrar.");
    }
    const eraBloqueio=bloqueado();
    gravarSessao({token:res.token,usuario:res.usuario.login,nome:res.usuario.nome});
    await guardarSenhaLocal(usuario,senha);
    if($("l-lembrar").checked)await lembrarSenha(usuario,senha);else esquecerSenha();
    ultimoUso=Date.now();try{localStorage.setItem("ultimo-uso",String(ultimoUso));}catch(err){}
    if(eraBloqueio){$("l-senha").value="";desbloquear();msg("App desbloqueado.");carregarListaObras();sincronizar();return;}
    try{localStorage.setItem("ultimo-usuario",res.usuario.login);localStorage.removeItem("obras-lista");}catch(err){}
    $("l-senha").value="";esconderLogin();
    await carregar();carregarListaObras();sincronizar();
    msg("Olá, "+res.usuario.nome+". Você está pronto para registrar o RDO.");
  }catch(err){$("l-msg").textContent=err.message;$("l-msg").className="msg err";}
  finally{b.disabled=false;}
});
let confirmaSair=false,tSair=null;
function rotuloSair(t,alerta){["b-sair-app","b-sair-top"].forEach(id=>{$(id).textContent=t;});$("b-sair-top").classList.toggle("alerta",!!alerta);}
function pedirSair(){
  const s=lerSessao();
  const pend=registros.filter(r=>r.central!=="ok"&&r.central!=="recusado"&&r.usuario===(s&&s.usuario)).length;
  if(!confirmaSair){
    confirmaSair=true;
    rotuloSair(pend?"Há "+pend+" RDO(s) seus sem envio. Toque de novo para sair":"Toque de novo para sair",true);
    clearTimeout(tSair);tSair=setTimeout(()=>{confirmaSair=false;rotuloSair("Sair");},5000);return;
  }
  confirmaSair=false;clearTimeout(tSair);rotuloSair("Sair");
  sairApp();
}
function sairApp(){
  gravarSessao(null);try{localStorage.removeItem("obras-lista");localStorage.removeItem("bloqueio");localStorage.removeItem("desbloq");}catch(e){}
  aplicarListaObras([]);$("l-usuario").value="";mostrarLogin("");
}
$("b-sair-app").onclick=pedirSair;
$("b-sair-top").onclick=pedirSair;
$("l-outro").onclick=()=>{sairApp();$("l-usuario").focus();};
/* ---------- senha lembrada no celular (cifrada com chave que não sai do aparelho) ---------- */
function chaveDb(){return new Promise((ok,no)=>{const q=indexedDB.open("rdo-chave",1);q.onupgradeneeded=()=>q.result.createObjectStore("k");q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});}
async function chaveCifra(){
  const d=await chaveDb();
  const ler=()=>new Promise((ok,no)=>{const r=d.transaction("k").objectStore("k").get("aes");r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  let k=await ler();
  if(!k){k=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    await new Promise((ok,no)=>{const t=d.transaction("k","readwrite");t.objectStore("k").put(k,"aes");t.oncomplete=ok;t.onerror=()=>no(t.error);});}
  return k;
}
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),deb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function lembrarSenha(usuario,senha){
  try{const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},await chaveCifra(),new TextEncoder().encode(senha));
    localStorage.setItem("senha-salva",JSON.stringify({u:usuario,iv:b64(iv),ct:b64(ct)}));}catch(e){}
}
function esquecerSenha(){try{localStorage.removeItem("senha-salva");}catch(e){}}
function temSenhaSalva(){try{return JSON.parse(localStorage.getItem("senha-salva")||"null");}catch(e){return null;}}
async function senhaSalva(usuario){
  const d=temSenhaSalva();if(!d||d.u!==usuario)return "";
  try{const p=await crypto.subtle.decrypt({name:"AES-GCM",iv:deb64(d.iv)},await chaveCifra(),deb64(d.ct));return new TextDecoder().decode(p);}
  catch(e){esquecerSenha();return "";}
}
// preenche a senha salva na tela de entrada
async function preencherSenhaSalva(){
  const u=$("l-usuario").value.trim().toLowerCase(),d=temSenhaSalva();
  $("l-lembrar").checked=!!d&&(!u||d.u===u);
  if(!u||!d||d.u!==u)return;
  const s=await senhaSalva(u);
  if(s&&!$("v-entrar").hidden&&!$("l-senha").value){$("l-senha").value=s;$("b-entrar-app").focus();
    if(!$("l-msg").textContent){$("l-msg").textContent="Senha salva neste celular. Toque em Entrar.";$("l-msg").className="msg";}}
}
$("l-usuario").addEventListener("change",()=>{$("l-senha").value="";preencherSenhaSalva();});
$("l-lembrar").addEventListener("change",()=>{if(!$("l-lembrar").checked)esquecerSenha();});
/* ---------- bloqueio por inatividade: volta para a tela de senha ---------- */
const INATIVO_MS=20*60*1000;
let ultimoUso=Date.now();
const bloqueado=()=>{try{return localStorage.getItem("bloqueio")==="1";}catch(e){return false;}};
function marcarUso(){
  if(bloqueado()||!lerSessao())return;
  const t=Date.now();if(t-ultimoUso<5000)return;
  ultimoUso=t;try{localStorage.setItem("ultimo-uso",String(t));}catch(e){}
}
["pointerdown","keydown","touchstart","scroll","input"].forEach(ev=>addEventListener(ev,marcarUso,{passive:true,capture:true}));
function lerUltimoUso(){try{return Math.max(ultimoUso,+localStorage.getItem("ultimo-uso")||0);}catch(e){return ultimoUso;}}
function verificarInatividade(){
  if(!lerSessao()||bloqueado())return;
  if(Date.now()-lerUltimoUso()>=INATIVO_MS)bloquearApp();
}
function modoBloqueio(on){
  $("l-usuario").readOnly=on;$("l-outro-box").hidden=!on;
  $("l-intro").textContent=on?"Por segurança, o app foi bloqueado após 20 minutos sem uso. Digite sua senha para continuar. O que você estava preenchendo não se perde.":"Use o usuário e a senha cadastrados pelo supervisor.";
}
function bloquearApp(){
  const s=lerSessao();if(!s)return;
  try{localStorage.setItem("bloqueio","1");}catch(e){}
  draftPut({...lerForm(),editId}).catch(()=>{});
  mostrarLogin("");modoBloqueio(true);
  $("l-usuario").value=s.usuario;$("l-senha").value="";preencherSenhaSalva();
}
function desbloquear(){
  try{localStorage.removeItem("bloqueio");localStorage.setItem("ultimo-uso",String(Date.now()));}catch(e){}
  ultimoUso=Date.now();modoBloqueio(false);esconderLogin();
}
setInterval(verificarInatividade,30*1000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")verificarInatividade();});
// senha guardada só como resumo (hash com sal) para desbloquear sem internet
async function resumoSenha(usuario,senha,sal){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(sal+"|"+usuario+"|"+senha));
  return btoa(String.fromCharCode(...new Uint8Array(b)));
}
async function guardarSenhaLocal(usuario,senha){
  try{const sal=crypto.getRandomValues(new Uint32Array(4)).join("-");
    localStorage.setItem("desbloq",JSON.stringify({u:usuario,sal,h:await resumoSenha(usuario,senha,sal)}));}catch(e){}
}
async function senhaLocalOk(usuario,senha){
  try{const d=JSON.parse(localStorage.getItem("desbloq")||"null");if(!d||d.u!==usuario)return false;
    return (await resumoSenha(usuario,senha,d.sal))===d.h;}catch(e){return false;}
}
// sessão expirada ou usuário desativado/senha redefinida pelo supervisor
const MSG_SESSAO="Sua sessão terminou (senha redefinida ou usuário alterado pelo supervisor). Entre novamente. Os RDOs salvos continuam no celular.";
function sessaoInvalida(){gravarSessao(null);esquecerSenha();try{localStorage.removeItem("bloqueio");localStorage.removeItem("desbloq");}catch(e){}try{localStorage.setItem("sessao-msg","1");}catch(e){}mostrarLogin(MSG_SESSAO);}
// apaga do celular os RDOs com mais de 48 h que já estão na central
async function limparAntigos(){
  if(!temCentral())return;
  const velhos=registros.filter(r=>!dentroPrazo(r)&&r.central==="ok"&&r.centralPdf==="ok");
  for(const r of velhos){try{await dbDel(r._id);}catch(e){}}
  if(velhos.length){registros=registros.filter(r=>!velhos.includes(r));}
}

/* ---------- salvar ---------- */
async function salvar(){
  const r=lerForm();
  if(editId){
    const atual=registros.find(x=>x._id===editId);
    if(atual&&!podeEditar(atual))throw new Error(motivoBloqueio(atual)+". Este RDO não pode mais ser alterado neste celular.");
  }
  const s=lerSessao();if(!s)throw new Error("Entre com seu usuário para salvar o RDO.");
  r.resp=s.nome;r.usuario=s.usuario;
  if(!r.rdo){r.rdo=String(proxRdo(r));$("rdo").value=r.rdo;}
  const id=editId||("rdo-"+Date.now());
  const existe=await verificarDiaCentral(r,id);
  if(existe){const e=new Error(existe.erro+" Se precisar complementar, edite o RDO existente (se for seu) ou fale com o supervisor.");e.dup=true;throw e;}
  const antigo=editId?registros.find(x=>x._id===editId):null;
  const reg={...r,_id:id,criadoEm:antigo?(antigo.criadoEm||new Date(criadoEm(antigo)).toISOString()):new Date().toISOString(),salvoEm:new Date().toISOString(),central:"pendente",centralPdf:"pendente"};
  await dbPut(reg);
  gravarContador(reg);
  await carregar();
  aplicarPerfil();
  sincronizar();
  return reg;
}

/* ---------- assinatura do encarregado (com o dedo) ---------- */
const assCv=$("ass-canvas");
let assCtx=null,assDesenhando=false,assUlt=null,assTracos=0;
function assPreparar(){
  const box=$("ass-box"),d=window.devicePixelRatio||1,w=box.clientWidth,h=box.clientHeight;
  if(!w||!h)return;
  if(assCv.width===Math.round(w*d)&&assCv.height===Math.round(h*d)&&assCtx)return;
  assCv.width=Math.round(w*d);assCv.height=Math.round(h*d);
  assCtx=assCv.getContext("2d");assCtx.setTransform(d,0,0,d,0,0);
  assCtx.lineCap="round";assCtx.lineJoin="round";assCtx.strokeStyle="#0B2545";assCtx.lineWidth=2.4;
  if(assinatura)assDesenharImagem(assinatura);
}
function assDesenharImagem(src){
  const img=new Image();img.onload=()=>{if(!assCtx)return;const w=assCv.clientWidth,h=assCv.clientHeight,s=Math.min(w/img.width,h/img.height);
    assCtx.clearRect(0,0,w,h);assCtx.drawImage(img,(w-img.width*s)/2,(h-img.height*s)/2,img.width*s,img.height*s);};img.src=src;
}
function definirAssinatura(src){
  assinatura=src||"";assTracos=0;
  if(!assCtx)assPreparar();
  if(assCtx)assCtx.clearRect(0,0,assCv.width,assCv.height);
  if(assinatura)assDesenharImagem(assinatura);
  $("ass-dica").hidden=!!assinatura;$("ass-box").classList.remove("err");
}
function assPos(e){const r=assCv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
assCv.addEventListener("pointerdown",e=>{
  assPreparar();if(!assCtx)return;
  e.preventDefault();assCv.setPointerCapture(e.pointerId);assDesenhando=true;assUlt=assPos(e);
  assCtx.beginPath();assCtx.arc(assUlt.x,assUlt.y,1.1,0,Math.PI*2);assCtx.fillStyle="#0B2545";assCtx.fill();
  $("ass-dica").hidden=true;$("ass-box").classList.remove("err");
});
assCv.addEventListener("pointermove",e=>{
  if(!assDesenhando)return;e.preventDefault();
  const p=assPos(e);assCtx.beginPath();assCtx.moveTo(assUlt.x,assUlt.y);assCtx.lineTo(p.x,p.y);assCtx.stroke();assUlt=p;assTracos++;
});
function assFim(){
  if(!assDesenhando)return;assDesenhando=false;
  assinatura=assExportar();update();
}
assCv.addEventListener("pointerup",assFim);assCv.addEventListener("pointercancel",assFim);
// exporta só a área assinada, com fundo transparente
function assExportar(){
  const w=assCv.width,h=assCv.height,px=assCtx.getImageData(0,0,w,h).data;
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){if(px[(y*w+x)*4+3]>20){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)return "";
  const m=12;x0=Math.max(0,x0-m);y0=Math.max(0,y0-m);x1=Math.min(w,x1+m);y1=Math.min(h,y1+m);
  const c=document.createElement("canvas");c.width=x1-x0;c.height=y1-y0;c.getContext("2d").drawImage(assCv,x0,y0,c.width,c.height,0,0,c.width,c.height);
  return c.toDataURL("image/png");
}
$("b-ass-limpar").onclick=()=>{definirAssinatura("");update();};
addEventListener("resize",()=>{assCtx=null;assPreparar();});
new ResizeObserver(()=>{if(!assDesenhando)assPreparar();}).observe($("ass-box"));
function nomeAssinatura(){$("ass-nome").textContent=(lerSessao()||{}).nome||"—";}

/* ---------- copiar horário, efetivo e equipamentos do último RDO da obra ---------- */
function mostrarBotaoCopiar(){$("b-copiar").hidden=!$("idobra").value.trim()||!!editId;}
$("b-copiar").onclick=async()=>{
  const id=$("idobra").value.trim(),data=$("data").value||hoje();if(!id)return;
  const b=$("b-copiar"),lbl=b.textContent;b.disabled=true;b.textContent="Procurando o último RDO…";
  try{
    // primeiro no celular; se não houver, na central
    let base=registros.filter(x=>norm(x.idobra)===norm(id)&&x.data<data).sort((a,c)=>a.data<c.data?1:a.data>c.data?-1:criadoEm(c)-criadoEm(a))[0]||null;
    let origem="neste celular";
    if(!base&&temCentral()&&navigator.onLine&&lerSessao()){
      try{const res=await postCentral({acao:"ultimoRdo",idobra:id,antesDe:data});base=res.rdo;origem="na central";}catch(e){}
    }
    if(!base){msg("Não encontrei RDO anterior desta obra para copiar.",true);return;}
    if(base.hini)$("hini").value=base.hini;if(base.hfim)$("hfim").value=base.hfim;
    MO.forEach(([k])=>{$(k).value=parseInt(base[k])>0?String(parseInt(base[k])):"";});
    if(base.equip)$("equip").value=base.equip;
    update();
    msg("Copiado do RDO nº "+(base.rdo||"-")+" de "+fmtData(base.data)+" ("+origem+"): horário, efetivo e equipamentos. Confira e ajuste o que mudou.");
  }finally{b.disabled=false;b.textContent=lbl;}
};

/* ---------- lista fixa de obras (cadastrada pelo supervisor) ---------- */
let listaObras=[];
function lerListaLocal(){try{return JSON.parse(localStorage.getItem("obras-lista")||"[]");}catch(e){return [];}}
function aplicarListaObras(lista){
  listaObras=(lista||[]).filter(o=>o&&o.id&&o.obra);
  const usar=listaObras.length>0||!!lerSessao();
  $("lbl-selobra").hidden=!usar;$("ident-manual").hidden=usar;
  const sel=$("selobra"),atual=$("idobra").value.trim();
  sel.innerHTML='<option value="">Escolha a obra…</option>'+listaObras.map(o=>`<option value="${esc(o.id)}">${esc(o.id+" - "+o.obra+(o.local?" / "+o.local:""))}</option>`).join("");
  sincronizarSelecao(atual);
}
// marca na lista a obra que está no formulário (rascunho ou RDO em edição)
function sincronizarSelecao(id){
  const sel=$("selobra");if(!listaObras.length)return;
  const o=listaObras.find(x=>norm(x.id)===norm(id));
  if(o){sel.value=o.id;}
  else if(String(id||"").trim()){
    // RDO antigo de obra que saiu da lista: mantém como estava
    const op=document.createElement("option");op.value=id;op.textContent=[id,$("obra").value].filter(Boolean).join(" - ")+" (fora da lista)";sel.appendChild(op);sel.value=id;
  }else sel.value="";
  mostrarObraInfo();
}
function mostrarObraInfo(){const i=$("obra-info");i.hidden=!$("selobra").value;i.textContent=$("selobra").value?"ID "+$("idobra").value+" · "+$("obra").value+($("local").value?" · "+$("local").value:""):"";}
$("selobra").addEventListener("change",()=>{
  const o=listaObras.find(x=>x.id===$("selobra").value);
  if(o){$("idobra").value=o.id;$("obra").value=o.obra;$("local").value=o.local||"";}
  else if(!$("selobra").value){$("idobra").value="";$("obra").value="";$("local").value="";}
  mostrarObraInfo();mostrarBotaoCopiar();update();
});
async function carregarListaObras(){
  aplicarListaObras(lerListaLocal());
  if(!(window.CENTRAL&&CENTRAL.url&&CENTRAL.chave)||!navigator.onLine||!lerSessao())return;
  try{
    const res=await postCentral({acao:"obras"});
    if(Array.isArray(res.obras)){
      try{localStorage.setItem("obras-lista",JSON.stringify(res.obras));}catch(e){}
      aplicarListaObras(res.obras);
      if(!res.obras.length)msg("Nenhuma obra está sob sua responsabilidade. Peça ao supervisor para incluir você nas obras.",true);
    }
  }catch(e){}
}

/* ---------- central do supervisor ---------- */
const CENTRAL=window.CENTRAL||{};
const temCentral=()=>!!(CENTRAL.url&&CENTRAL.chave);
let sincronizando=false;
async function postCentral(o){
  const s=lerSessao();if(!s)throw new Error("sem login");
  const r=await fetch(CENTRAL.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...o,chave:CENTRAL.chave,token:s.token})});
  const res=await r.json();
  if(!res.ok){if(res.erro==="sessao"){sessaoInvalida();throw new Error("login necessário");}const er=new Error(res.erro||"falha no envio");er.codigo=res.codigo||"";throw er;}
  return res;
}
async function enviarCentral(r){
  const fs=(r.fotos||[]).filter(f=>f&&f.blob);
  const {fotos,...dados}=r;
  await postCentral({acao:"salvar",rdo:{...dados,uid:r._id,n_fotos:fs.length}});
  for(let i=0;i<fs.length;i++){
    const b64=(await blobToData(fs[i].blob)).split(",")[1];
    await postCentral({acao:"foto",uid:r._id,idx:i,desc:fs[i].desc||"",b64});
  }
  await postCentral({acao:"fim",uid:r._id});
  await enviarPdfCentral(r);
}
// PDF do RDO guardado na pasta da obra, junto das fotos
async function enviarPdfCentral(r){
  const b64=(await blobToData(await gerarPdf([r]))).split(",")[1];
  await postCentral({acao:"pdf",uid:r._id,b64});
}
async function sincronizar(){
  if(!temCentral()||sincronizando||!navigator.onLine||!lerSessao())return;
  sincronizando=true;let erro="";
  try{
    const meus=r=>doResponsavel(r);
    for(const r of registros.filter(x=>x.central!=="ok"&&x.central!=="recusado"&&meus(x))){
      try{await enviarCentral(r);r.central="ok";r.centralPdf="ok";r.centralEm=new Date().toISOString();delete r.erroCentral;await dbPut(r);}
      catch(e){
        if(e&&e.codigo){r.central="recusado";r.erroCentral=String(e.message);await dbPut(r);continue;}   // recusa definitiva: segue com os outros
        erro=String(e&&e.message||e);break;
      }
    }
    // RDOs enviados antes desta versão: completa só o PDF
    if(!erro)for(const r of registros.filter(x=>x.central==="ok"&&x.centralPdf!=="ok"&&meus(x))){
      try{await enviarPdfCentral(r);r.centralPdf="ok";await dbPut(r);}
      catch(e){erro=String(e&&e.message||e);break;}
    }
  }finally{sincronizando=false;ultimoErroCentral=erro;render();}
}
let ultimoErroCentral="";
window.addEventListener("online",sincronizar);
setInterval(()=>{if(document.visibilityState==="visible")sincronizar();},60000);

/* ---------- texto da mensagem ---------- */
function textoCompleto(r){
  const L=["*DIÁRIO DE OBRA · RDO nº "+(r.rdo||"-")+"*",...(r.idobra?["*ID:* "+r.idobra]:[]),"*Obra:* "+(r.obra||"-"),...(r.local?["*Local:* "+r.local]:[]),"*Data:* "+(fmtData(r.data)||"-")];
  if(r.hini||r.hfim)L.push("*Expediente:* "+(r.hini||"?")+" às "+(r.hfim||"?"));
  L.push("*Responsável:* "+(r.resp||"-"),"");
  L.push("*Tempo:* manhã "+(semIcone(r.clima_manha)||"não informado")+" | tarde "+(semIcone(r.clima_tarde)||"não informado"));
  const mo=MO.filter(([k])=>parseInt(r[k])>0).map(([k,n])=>n+" "+parseInt(r[k]));
  L.push("*Efetivo:* "+total(r)+" pessoas"+(mo.length?" ("+mo.join(", ")+")":""),"");
  L.push("*Atividades executadas:*",linhas(r.ativ)||"-");
  if(r.equip)L.push("","*Equipamentos:*",linhas(r.equip));
  if(r.mat)L.push("","*Materiais recebidos:*",linhas(r.mat));
  L.push("","*Ocorrências:* "+(r.ocor?"\n"+linhas(r.ocor):"Sem ocorrências"));
  if(r.obs)L.push("","*Observações:* "+r.obs);
  return L.join("\n");
}
function textoCurto(r){
  const n=(r.fotos||[]).length;
  return "*RDO nº "+(r.rdo||"-")+"* · "+obraNome(r)+"\n"+fmtData(r.data)+" · "+(r.resp||"")+"\nDiário de obra em "+((envio&&envio.F&&envio.F.rotulo)||"PDF")+(n?" com "+n+" foto"+(n>1?"s":"")+" e legendas":"")+".";
}

/* ---------- PDF ---------- */
let logoData=null;
function blobToData(b){return new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(b);});}
function dims(src){return new Promise(ok=>{const i=new Image();i.onload=()=>ok([i.naturalWidth,i.naturalHeight]);i.onerror=()=>ok([4,3]);i.src=src;});}
async function gerarPdf(lst){
  const {jsPDF}=window.jspdf, doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=210,H=297,M=15,CW=W-2*M;
  const MAR=[0,43,73],AZ=[0,115,168],TE=[102,211,205],TX=[29,29,27],CZ=[96,96,96];
  if(!logoData)logoData=await blobToData(await (await fetch("logo.png")).blob());
  const [lw,lh]=await dims(logoData);
  let y=0;
  function cabecalho(r){
    doc.addImage(logoData,"PNG",M,10,38,38*lh/lw);
    doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...MAR);
    doc.text("RELATÓRIO DIÁRIO DE OBRA",W-M,15,{align:"right"});
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...CZ);
    doc.text("RDO nº "+(r.rdo||"-")+"  ·  "+fmtData(r.data),W-M,20.5,{align:"right"});
    const sy=10+38*lh/lw+4;
    doc.setFillColor(...TE);doc.rect(0,sy,W/3,1.6,"F");doc.setFillColor(...AZ);doc.rect(W/3,sy,W/3,1.6,"F");doc.setFillColor(...MAR);doc.rect(2*W/3,sy,W/3,1.6,"F");
    y=sy+8;
  }
  function rodape(){
    doc.setFontSize(7.5);doc.setTextColor(...CZ);doc.setFont("helvetica","normal");
    doc.text("ECTAS Saneamento S.A. · Rua Hans Dieter Schmidt, 1803, Distrito Industrial Norte, Joinville/SC · (47) 3033-1200",W/2,H-8,{align:"center"});
  }
  function espaco(h,r){if(y+h>H-18){rodape();doc.addPage();cabecalho(r);}}
  function secao(t,r){espaco(12,r);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...AZ);doc.text(t.toUpperCase(),M,y);doc.setDrawColor(...TE);doc.setLineWidth(.4);doc.line(M,y+1.5,W-M,y+1.5);y+=6.5;}
  function bloco(t,r){
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(...TX);
    doc.splitTextToSize(t||"-",CW).forEach(l=>{espaco(5,r);doc.text(l,M,y);y+=4.8;});y+=2;
  }
  function campos(pares,r){
    const cw=CW/2;
    for(let i=0;i<pares.length;i+=2){
      espaco(11,r);
      pares.slice(i,i+2).forEach(([k,v],j)=>{
        const x=M+j*cw;
        doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(...CZ);doc.text(k.toUpperCase(),x,y);
        doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(...TX);doc.text(doc.splitTextToSize(String(v||"-"),cw-4)[0],x,y+4.6);
      });
      y+=11;
    }
  }
  for(let n=0;n<lst.length;n++){
    const r=lst[n];
    if(n>0){rodape();doc.addPage();}
    cabecalho(r);
    secao("Identificação",r);
    campos([["ID da obra",r.idobra],["Obra",r.obra],["Local",r.local],["Responsável",r.resp],["Data",fmtData(r.data)],["Expediente",(r.hini||"?")+" às "+(r.hfim||"?")],
      ["Tempo manhã",semIcone(r.clima_manha)||"não informado"],["Tempo tarde",semIcone(r.clima_tarde)||"não informado"]],r);
    secao("Mão de obra",r);
    const mo=MO.filter(([k])=>parseInt(r[k])>0).map(([k,nm])=>nm+": "+parseInt(r[k]));
    bloco("Total: "+total(r)+" pessoas"+(mo.length?"  ("+mo.join(" · ")+")":""),r);
    secao("Atividades executadas",r);bloco(linhas(r.ativ),r);
    if(r.equip){secao("Equipamentos utilizados",r);bloco(linhas(r.equip),r);}
    if(r.mat){secao("Materiais recebidos",r);bloco(linhas(r.mat),r);}
    secao("Ocorrências",r);bloco(r.ocor?linhas(r.ocor):"Sem ocorrências.",r);
    if(r.obs){secao("Observações",r);bloco(r.obs,r);}
    const fs=(r.fotos||[]).filter(f=>f&&f.blob);
    if(fs.length){
      secao("Registro fotográfico",r);
      const gap=6,fw=(CW-gap)/2,fh=fw*0.75;
      for(let i=0;i<fs.length;i++){
        const col=i%2;
        if(col===0)espaco(fh+14,r);
        const x=M+col*(fw+gap);
        try{
          const data=await blobToData(fs[i].blob);
          const [iw,ih]=await dims(data);const s=Math.min(fw/iw,fh/ih),dw=iw*s,dh=ih*s;
          doc.setFillColor(238,242,245);doc.rect(x,y,fw,fh,"F");
          doc.addImage(data,"JPEG",x+(fw-dw)/2,y+(fh-dh)/2,dw,dh);
        }catch(e){doc.setDrawColor(...CZ);doc.rect(x,y,fw,fh);doc.setFontSize(8);doc.text("foto indisponível",x+fw/2,y+fh/2,{align:"center"});}
        doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(...AZ);doc.text("Foto "+(i+1),x,y+fh+4);
        doc.setFont("helvetica","normal");doc.setTextColor(...TX);
        doc.text(doc.splitTextToSize(fs[i].desc||"sem legenda",fw).slice(0,2),x,y+fh+8);
        if(col===1||i===fs.length-1)y+=fh+16;
      }
    }
    espaco(42,r);y+=24;
    if(r.assinatura){
      try{const [aw,ah]=await dims(r.assinatura);const s=Math.min(70/aw,22/ah);
        doc.addImage(r.assinatura,"PNG",M+(75-aw*s)/2,y-1-ah*s,aw*s,ah*s);}catch(e){}
    }
    doc.setDrawColor(...CZ);doc.setLineWidth(.3);doc.line(M,y,M+75,y);doc.line(W-M-75,y,W-M,y);
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...TX);doc.text(r.resp||"",M+37.5,y+4.5,{align:"center"});
    doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...CZ);
    doc.text("Responsável pela obra (encarregado)",M+37.5,y+8.5,{align:"center"});doc.text("Fiscalização",W-M-37.5,y+4.5,{align:"center"});
    rodape();
  }
  return doc.output("blob");
}

/* ---------- Word (.docx) ---------- */
function carregarScript(src,glob){
  if(window[glob])return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=()=>no(new Error("não carregou "+src));document.head.appendChild(s);});
}
async function gerarDocx(r){
  await carregarScript("lib/docx.umd.js","docx");
  const D=window.docx;
  const AZ="0073A8",MAR="002B49",TE="66D3CD",CZ="606060",TX="1D1D1B";
  const F="Montserrat";
  const semBorda={style:D.BorderStyle.NONE,size:0,color:"FFFFFF"};
  const bordas0={top:semBorda,bottom:semBorda,left:semBorda,right:semBorda,insideHorizontal:semBorda,insideVertical:semBorda};
  const t=(text,o={})=>new D.TextRun({text:String(text==null?"":text),font:F,size:o.size||20,bold:!!o.bold,color:o.color||TX,italics:!!o.it});
  const p=(runs,o={})=>new D.Paragraph({children:Array.isArray(runs)?runs:[runs],spacing:{after:o.after==null?80:o.after,before:o.before||0},alignment:o.align,border:o.border});
  const secao=txt=>p(t(txt.toUpperCase(),{bold:true,color:AZ,size:18}),{before:200,after:100,border:{bottom:{color:TE,space:2,style:D.BorderStyle.SINGLE,size:8}}});
  const texto=txt=>(linhas(txt)||"-").split("\n").map(l=>p(t(l)));
  const buf=b=>b.arrayBuffer();
  const logoBuf=await (await fetch("logo.png")).arrayBuffer();
  const [lw,lh]=await dims("logo.png");
  // cabeçalho
  const cab=new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},borders:bordas0,rows:[new D.TableRow({children:[
    new D.TableCell({borders:bordas0,width:{size:40,type:D.WidthType.PERCENTAGE},children:[new D.Paragraph({children:[new D.ImageRun({data:logoBuf,transformation:{width:150,height:Math.round(150*lh/lw)}})]})]}),
    new D.TableCell({borders:bordas0,width:{size:60,type:D.WidthType.PERCENTAGE},children:[
      p(t("RELATÓRIO DIÁRIO DE OBRA",{bold:true,color:MAR,size:26}),{align:D.AlignmentType.RIGHT,after:40}),
      p(t("RDO nº "+(r.rdo||"-")+"  ·  "+fmtData(r.data),{color:CZ,size:18}),{align:D.AlignmentType.RIGHT,after:0})]})
  ]})]});
  const faixa=p(t(""),{after:120,border:{bottom:{color:AZ,space:1,style:D.BorderStyle.SINGLE,size:18}}});
  // identificação em tabela
  const campo=(k,v)=>new D.TableCell({borders:bordas0,children:[p(t(k.toUpperCase(),{bold:true,color:CZ,size:14}),{after:20}),p(t(v||"-"),{after:100})]});
  const linha=(a,b)=>new D.TableRow({children:[campo(...a),campo(...b)]});
  const ident=new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},borders:bordas0,rows:[
    linha(["ID da obra",r.idobra],["Obra",r.obra]),
    linha(["Local",r.local],["Responsável",r.resp]),
    linha(["Data",fmtData(r.data)],["Expediente",(r.hini||"?")+" às "+(r.hfim||"?")]),
    linha(["Tempo manhã",semIcone(r.clima_manha)||"não informado"],["Tempo tarde",semIcone(r.clima_tarde)||"não informado"])]});
  const mo=MO.filter(([k])=>parseInt(r[k])>0).map(([k,nm])=>nm+": "+parseInt(r[k]));
  const corpo=[cab,faixa,secao("Identificação"),ident,
    secao("Mão de obra"),p(t("Total: "+total(r)+" pessoas"+(mo.length?"  ("+mo.join(" · ")+")":""))),
    secao("Atividades executadas"),...texto(r.ativ)];
  if(r.equip)corpo.push(secao("Equipamentos utilizados"),...texto(r.equip));
  if(r.mat)corpo.push(secao("Materiais recebidos"),...texto(r.mat));
  corpo.push(secao("Ocorrências"),...(r.ocor?texto(r.ocor):[p(t("Sem ocorrências."))]));
  if(r.obs)corpo.push(secao("Observações"),p(t(r.obs)));
  // fotos: 2 por linha, legenda embaixo
  const fs=(r.fotos||[]).filter(f=>f&&f.blob);
  if(fs.length){
    corpo.push(secao("Registro fotográfico"));
    const W=300,H=225,rows=[];
    for(let i=0;i<fs.length;i+=2){
      const cells=[];
      for(let k=i;k<i+2;k++){
        if(k>=fs.length){cells.push(new D.TableCell({borders:bordas0,children:[p(t(""))]}));continue;}
        const f=fs[k],u=URL.createObjectURL(f.blob),[iw,ih]=await dims(u);URL.revokeObjectURL(u);
        const s=Math.min(W/iw,H/ih);
        cells.push(new D.TableCell({borders:bordas0,width:{size:50,type:D.WidthType.PERCENTAGE},children:[
          new D.Paragraph({alignment:D.AlignmentType.CENTER,children:[new D.ImageRun({data:await buf(f.blob),transformation:{width:Math.round(iw*s),height:Math.round(ih*s)}})]}),
          p([t("Foto "+(k+1)+": ",{bold:true,color:AZ,size:17}),t(f.desc||"sem legenda",{size:17})],{after:200})]}));
      }
      rows.push(new D.TableRow({cantSplit:true,children:cells}));
    }
    corpo.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},borders:bordas0,rows}));
  }
  // assinaturas
  const C=D.AlignmentType.CENTER;
  const linhaAss=img=>img?new D.Paragraph({alignment:C,spacing:{before:200,after:0},border:{bottom:{color:CZ,space:1,style:D.BorderStyle.SINGLE,size:6}},children:[img]})
    :p(t(""),{before:900,after:0,border:{bottom:{color:CZ,space:1,style:D.BorderStyle.SINGLE,size:6}}});
  let imgAss=null;
  if(r.assinatura){try{const [aw,ah]=await dims(r.assinatura),s=Math.min(240/aw,70/ah);
    imgAss=new D.ImageRun({data:await (await fetch(r.assinatura)).arrayBuffer(),transformation:{width:Math.round(aw*s),height:Math.round(ah*s)}});}catch(e){}}
  const cEnc=new D.TableCell({borders:bordas0,width:{size:45,type:D.WidthType.PERCENTAGE},children:[linhaAss(imgAss),
    p(t(r.resp||"",{bold:true,size:18}),{align:C,after:0}),p(t("Responsável pela obra (encarregado)",{color:CZ,size:16}),{align:C})]});
  const cFis=new D.TableCell({borders:bordas0,width:{size:45,type:D.WidthType.PERCENTAGE},children:[linhaAss(null),p(t("Fiscalização",{color:CZ,size:16}),{align:C})]});
  corpo.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},borders:bordas0,rows:[new D.TableRow({cantSplit:true,children:[cEnc,new D.TableCell({borders:bordas0,width:{size:10,type:D.WidthType.PERCENTAGE},children:[p(t(""))]}),cFis]})]}));
  const doc=new D.Document({
    creator:"Diário de Obra ECTAS",title:"RDO "+(r.rdo||"")+" "+obraNome(r),
    styles:{default:{document:{run:{font:F,size:20}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:851,bottom:851,left:1021,right:1021}}},
      footers:{default:new D.Footer({children:[p(t("ECTAS Saneamento S.A. · Rua Hans Dieter Schmidt, 1803, Distrito Industrial Norte, Joinville/SC · (47) 3033-1200",{color:CZ,size:14}),{align:D.AlignmentType.CENTER,after:0})]})},
      children:corpo}]
  });
  return D.Packer.toBlob(doc);
}
const FORMATOS={
  pdf:{rotulo:"PDF",ext:"pdf",tipo:"application/pdf",gerar:r=>gerarPdf([r])},
  docx:{rotulo:"Word",ext:"docx",tipo:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",gerar:gerarDocx}
};

/* ---------- enviar no WhatsApp ---------- */
function podeCompartilhar(file){try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));}catch(e){return false;}}
async function compartilhar(){
  // precisa de um toque recente na tela (regra do celular)
  const {file,r}=envio;
  try{
    await navigator.share({files:[file],text:textoCurto(r),title:file.name});
    pfMsg("Enviado. Confira no WhatsApp se foi para o grupo certo.");
    return true;
  }catch(e){
    if(e&&e.name==="AbortError"){pfMsg("Envio cancelado. Toque no botão verde para tentar de novo.");return false;}
    if(e&&e.name==="NotAllowedError"){pfMsg("Toque no botão verde para enviar.");return false;}
    pfMsg("Não consegui abrir o compartilhamento ("+(e&&e.message||e)+").",true);return false;
  }
}
async function prepararEnvio(r,fmt){
  const F=FORMATOS[fmt||"pdf"];
  const blob=await F.gerar(r);
  const nome=nomeArq("RDO "+(r.rdo||"")+" "+[r.idobra,r.obra].filter(Boolean).join(" ")+" "+(r.data||""),F.ext);
  const file=new File([blob],nome,{type:F.tipo});
  envio={r,file,blob,nome,F};
  const n=(r.fotos||[]).length;
  $("pf-tit").textContent=F.rotulo+" do RDO "+(r.rdo||"")+" pronto";
  $("pf-info").textContent=obraNome(r)+" · "+fmtData(r.data)+" · "+(n?n+" foto"+(n>1?"s":"")+" com legenda":"sem fotos")+".";
  $("pf-thumbs").innerHTML=(r.fotos||[]).map((f,i)=>`<figure><img src="${esc(URL.createObjectURL(f.blob))}" alt="Foto ${i+1}"><figcaption>${i+1}. ${esc(f.desc||"sem legenda")}</figcaption></figure>`).join("");
  $("pf-nome").textContent=nome;
  const share=podeCompartilhar(file);
  $("pf-enviar").textContent=share?"Enviar "+F.rotulo+" no WhatsApp":"Abrir WhatsApp";
  $("pf-passos").hidden=share;pfMsg("");
  $("pf-fotos").hidden=!(share&&n);
  $("v-painel").hidden=false;window.scrollTo(0,0);
  return share;
}
$("pf-enviar").onclick=()=>{
  if(!envio)return;
  if(podeCompartilhar(envio.file))compartilhar();
  else abrirWa(textoCurto(envio.r));
};
// fotos soltas, com o texto do RDO como legenda
function arquivosFotos(r){
  const base=nomeArq("RDO "+(r.rdo||"")+" "+[r.idobra,r.obra].filter(Boolean).join(" "),"x").slice(0,-2);
  return (r.fotos||[]).filter(f=>f&&f.blob).map((f,i)=>new File([f.blob],base+"_foto"+(i+1)+".jpg",{type:"image/jpeg"}));
}
function textoComFotos(r){
  const fs=(r.fotos||[]);
  return textoCompleto(r)+(fs.length?"\n\n*Fotos:*\n"+fs.map((f,i)=>(i+1)+". "+(f.desc||"sem legenda")).join("\n"):"");
}
async function enviarFotos(r,out){
  const files=arquivosFotos(r);
  if(!files.length){out("Este RDO não tem fotos. Use o envio em PDF ou só texto.",true);return;}
  let ok=false;try{ok=!!(navigator.share&&navigator.canShare&&navigator.canShare({files}));}catch(e){}
  if(!ok){out("Este aparelho não envia fotos direto daqui. Use o envio em PDF.",true);return;}
  try{await navigator.share({files,text:textoComFotos(r)});out("Fotos enviadas com o texto. Confira no WhatsApp.");}
  catch(e){
    if(e&&e.name==="AbortError"){out("Envio cancelado.");return;}
    if(e&&e.name==="NotAllowedError"){envio=envio||{r};envio.r=r;$("v-painel").hidden=false;window.scrollTo(0,0);pfMsg("Toque em Enviar fotos com o texto para concluir.");return;}
    out("Não consegui abrir o compartilhamento ("+(e&&e.message||e)+").",true);
  }
}
$("pf-fotos").onclick=()=>{if(envio&&envio.r)enviarFotos(envio.r,pfMsg);};
$("b-fotos").onclick=async()=>{
  if(!validar())return;
  if(!fotos.length){msg("Adicione pelo menos uma foto, ou use o envio em PDF.",true);return;}
  try{const r=await salvar();limpar();msg("RDO "+r.rdo+" salvo.");await enviarFotos(r,msg);}
  catch(e){msg(e&&e.dup?e.message:"Não consegui salvar ("+(e&&e.message||e)+").",true);}
};
$("pf-fechar").onclick=()=>{$("v-painel").hidden=true;envio=null;};

async function salvarEEnviar(btn,fmt){
  if(!validar())return;
  const F=FORMATOS[fmt],lbl=btn.innerHTML;btn.disabled=true;btn.textContent="Gerando o "+F.rotulo+"…";
  try{
    const r=await salvar();
    const share=await prepararEnvio(r,fmt);
    limpar();
    msg("RDO "+r.rdo+" salvo.");
    if(share)await compartilhar();      // abre direto a tela de compartilhar
    else{baixarArquivo(envio.blob,envio.nome);pfMsg("Este aparelho não envia arquivos direto. O "+F.rotulo+" foi baixado: use Abrir WhatsApp e anexe pelo clipe.");}
  }catch(e){msg(e&&e.dup?e.message:"Não consegui gerar o "+F.rotulo+" ("+(e&&e.message||e)+").",true);}
  finally{btn.disabled=false;btn.innerHTML=lbl;}
}
$("b-wa").onclick=()=>salvarEEnviar($("b-wa"),"pdf");
$("b-word").onclick=()=>salvarEEnviar($("b-word"),"docx");
$("b-save").onclick=async()=>{
  if(!validar())return;
  try{const r=await salvar();limpar();msg("RDO "+r.rdo+" salvo neste celular.");}
  catch(e){msg(e&&e.dup?e.message:"Não consegui salvar ("+(e&&e.message||e)+").",true);}
};
$("b-txt").onclick=()=>{if(!validar())return;const r=lerForm();if(!r.rdo){r.rdo=String(proxRdo(r));$("rdo").value=r.rdo;}abrirWa(textoCompleto(r));};
let confirmLimpar=false;
$("b-limpar").onclick=()=>{
  if(!confirmLimpar){confirmLimpar=true;$("b-limpar").textContent="Toque de novo para confirmar";setTimeout(()=>{confirmLimpar=false;$("b-limpar").textContent="Limpar formulário";},3000);return;}
  confirmLimpar=false;$("b-limpar").textContent="Limpar formulário";limpar();msg("");
};

/* ---------- abas e histórico ---------- */
function tab(h){$("t-novo").setAttribute("aria-selected",String(!h));$("t-hist").setAttribute("aria-selected",String(h));$("v-novo").hidden=h;$("v-hist").hidden=!h;}
$("t-novo").onclick=()=>tab(false);$("t-hist").onclick=()=>tab(true);
function filtrados(asc){
  const o=$("fobra").value;
  return registros.filter(r=>!o||obraChave(r)===o).sort((a,b)=>{const d=(a.data||"").localeCompare(b.data||"")||(parseInt(a.rdo)||0)-(parseInt(b.rdo)||0);return asc?d:-d;});
}
let thumbUrls=[];
function render(){
  const pend=temCentral()?registros.filter(r=>r.central!=="ok"&&r.central!=="recusado").length:0;
  const st=$("sync-st");
  if(st){st.hidden=!pend;st.querySelector("span").textContent=pend+" RDO"+(pend>1?"s":"")+" aguardando envio à central do supervisor"+(ultimoErroCentral?" (último erro: "+ultimoErroCentral+")":navigator.onLine?"":" (sem internet)")+".";}
  const uniq=k=>[...new Set(registros.map(r=>r[k]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt"));
  $("ids").innerHTML=uniq("idobra").map(o=>`<option value="${esc(o)}">`).join("");
  $("obras").innerHTML=uniq("obra").map(o=>`<option value="${esc(o)}">`).join("");
  $("locais").innerHTML=uniq("local").map(o=>`<option value="${esc(o)}">`).join("");
  const obras=[...new Set(registros.map(obraChave))].map(k=>[k,obraNome(canon[k]||{})]).sort((a,b)=>a[1].localeCompare(b[1],"pt"));
  const sel=$("fobra"),cur=sel.value;
  sel.innerHTML='<option value="">Todas as obras</option>'+obras.map(([k,n])=>`<option value="${esc(k)}"${k===cur?" selected":""}>${esc(n)}</option>`).join("");
  $("hist-n").textContent=registros.length?"("+registros.length+")":"";
  thumbUrls.forEach(u=>URL.revokeObjectURL(u));thumbUrls=[];
  const lst=filtrados(false);
  if(!lst.length){$("lista").innerHTML='<div class="empty">Nenhum RDO nas últimas 48 horas. Preencha a aba <b>Novo registro</b>; os diários aparecem aqui, do mais recente para o mais antigo.</div>';return;}
  $("lista").innerHTML=lst.map(r=>{
    const fs=(r.fotos||[]).filter(f=>f&&f.blob);
    const th=fs.map((f,i)=>{const u=URL.createObjectURL(f.blob);thumbUrls.push(u);return `<figure><img src="${u}" alt="Foto ${i+1}" loading="lazy"><figcaption>${esc(f.desc||"Foto "+(i+1))}</figcaption></figure>`;}).join("");
    return `<article class="entry">
      <div class="top"><h3>${esc(obraNome(r))}</h3><span class="rdo">RDO ${esc(r.rdo||"-")}</span></div>
      ${temCentral()?(r.central==="ok"?'<div><span class="pill ok">✓ Na central do supervisor</span></div>':r.central==="recusado"?`<div class="recusado"><span class="pill alert">✗ Não aceito pela central</span> ${esc(r.erroCentral||"")} Corrija a data (Editar) ou exclua este RDO.</div>`:'<div><span class="pill">⏳ Aguardando envio à central</span></div>'):""}
      <div class="meta">${esc(fmtData(r.data))} · ${esc(r.resp)} · <span class="num">${total(r)}</span> pessoas</div>
      ${r.ocor?'<div><span class="pill alert">Ocorrência</span></div>':""}
      <div class="body">${esc((r.ativ||"").split("\n")[0])}${(r.ativ||"").includes("\n")?" …":""}</div>
      ${th?`<div class="thumbs">${th}</div>`:""}
      <div class="tools">
        <button class="btn wa" data-a="wa" data-f="pdf" data-id="${esc(r._id)}">Enviar PDF</button>
        <button class="btn wa" data-a="wa" data-f="docx" data-id="${esc(r._id)}">Enviar Word</button>
        ${podeEditar(r)?`<button class="btn sec" data-a="ed" data-id="${esc(r._id)}">Editar</button>`:""}
        ${podeEditar(r)||(r.central==="recusado"&&doResponsavel(r))?`<button class="btn sec" data-a="del" data-id="${esc(r._id)}">Excluir</button>`:""}
      </div>
      ${podeEditar(r)?`<div class="status" style="text-align:left">Pode editar até ${esc(new Date(criadoEm(r)+PRAZO_MS).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))}</div>`:`<div><span class="pill">🔒 ${esc(motivoBloqueio(r))}</span></div>`}
    </article>`;}).join("");
}
$("fobra").onchange=render;
$("lista").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-a]");if(!b)return;
  const r=registros.find(x=>x._id===b.dataset.id);if(!r)return;
  if(b.dataset.a==="wa"){
    const fmt=b.dataset.f||"pdf",lbl=b.textContent;b.disabled=true;b.textContent="Gerando…";
    try{const share=await prepararEnvio(r,fmt);tab(false);if(share)await compartilhar();else{baixarArquivo(envio.blob,envio.nome);}}
    catch(err){msgExp("Não consegui gerar o arquivo ("+(err&&err.message||err)+").",true);}
    finally{b.disabled=false;b.textContent=lbl;}
  }
  if((b.dataset.a==="ed"||b.dataset.a==="del")&&!podeEditar(r)&&!(b.dataset.a==="del"&&r.central==="recusado"&&doResponsavel(r))){msgExp(motivoBloqueio(r)+".",true);render();return;}
  if(b.dataset.a==="ed"){preencher(r);aplicarPerfil();editId=r._id;sincronizarSelecao(r.idobra);update();tab(false);window.scrollTo(0,0);msg("Editando o RDO "+(r.rdo||"")+". Salve para gravar as mudanças.");}
  if(b.dataset.a==="del"){
    if(b.dataset.c!=="1"){b.dataset.c="1";b.textContent="Confirmar exclusão";b.style.color="var(--danger)";return;}
    await dbDel(r._id);await carregar();
  }
});

/* ---------- exportar ---------- */
async function entregar(blob,nome,tipo){
  const file=new File([blob],nome,{type:tipo});
  if(podeCompartilhar(file)){
    try{await navigator.share({files:[file],title:nome});msgExp("Arquivo compartilhado: "+nome);return;}
    catch(e){if(e&&e.name==="AbortError"){msgExp("Cancelado.");return;}}
  }
  baixarArquivo(blob,nome);msgExp("Arquivo baixado: "+nome);
}
function carregarXlsx(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement("script");s.src="lib/xlsx.full.min.js";s.onload=ok;s.onerror=()=>no(new Error("não carregou o gerador de planilha"));document.head.appendChild(s);});
}
$("b-xlsx").onclick=async()=>{
  const lst=filtrados(true);if(!lst.length){msgExp("Nenhum registro para exportar.",true);return;}
  try{
    msgExp("Gerando a planilha…");await carregarXlsx();
    const rows=lst.map(r=>{
      const o={"ID":r.idobra||"","Obra":r.obra,"Local":r.local||"","RDO":parseInt(r.rdo)||r.rdo,"Data":fmtData(r.data),"Responsável":r.resp,"Início":r.hini,"Fim":r.hfim,"Tempo manhã":semIcone(r.clima_manha),"Tempo tarde":semIcone(r.clima_tarde)};
      MO.forEach(([k,n])=>o[n]=parseInt(r[k])||0);
      Object.assign(o,{"Total efetivo":total(r),"Atividades executadas":r.ativ,"Equipamentos":r.equip,"Materiais recebidos":r.mat,"Ocorrências":r.ocor,"Observações":r.obs,
        "Fotos (legendas)":(r.fotos||[]).map((f,i)=>(i+1)+". "+(f.desc||"sem legenda")).join("\n")});
      return o;
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    ws["!cols"]=Object.keys(rows[0]).map(k=>({wch:/Atividades|Ocorr|Fotos|Equip|Materiais|Observ/.test(k)?45:k==="Obra"?28:14}));
    ws["!autofilter"]={ref:ws["!ref"]};
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Diário de Obra");
    const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    await entregar(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),nomeArq("Diario de Obra "+($("fobra").value||"todas as obras")+" "+hoje(),"xlsx"),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }catch(e){msgExp("Não consegui gerar a planilha ("+(e&&e.message||e)+").",true);}
};
$("b-pdfs").onclick=async()=>{
  const lst=filtrados(true);if(!lst.length){msgExp("Nenhum registro para exportar.",true);return;}
  try{msgExp("Gerando o PDF…");const blob=await gerarPdf(lst);await entregar(blob,nomeArq("RDOs "+($("fobra").value||"todas as obras")+" "+hoje(),"pdf"),"application/pdf");}
  catch(e){msgExp("Não consegui gerar o PDF ("+(e&&e.message||e)+").",true);}
};

/* ---------- instalar como app ---------- */
let promptInstalar=null;
const instalado=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();promptInstalar=e;if(!instalado)$("instalar").hidden=false;});
$("b-instalar").onclick=async()=>{if(!promptInstalar)return;promptInstalar.prompt();await promptInstalar.userChoice;promptInstalar=null;$("instalar").hidden=true;};
if(!instalado&&/iphone|ipad|ipod/i.test(navigator.userAgent)){
  $("instalar").hidden=false;$("b-instalar").hidden=true;
  $("instalar-txt").textContent="Para instalar no iPhone: toque em Compartilhar (quadrado com seta) e depois em Adicionar à Tela de Início.";
}
if("serviceWorker" in navigator&&location.protocol==="https:"){
  // busca sempre a versão nova e recarrega quando ela chegar
  const tinha=!!navigator.serviceWorker.controller;let recarregou=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(tinha&&!recarregou){recarregou=true;draftPut({...lerForm(),editId}).catch(()=>{}).finally(()=>location.reload());}});
  navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>{r.update();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")r.update();});}).catch(()=>{});
}

/* ---------- início ---------- */
$("versao").textContent="Versão "+VERSAO;
(async()=>{
  try{const d=await draftGet();if(d){preencher(d);editId=d.editId||null;}}catch(e){}
  if(!$("data").value)$("data").value=hoje();
  paintClima();renderFotos();$("mtot").textContent=total(lerForm());
  aplicarPerfil();
  await carregar();
  if(!lerSessao())mostrarLogin("");
  else if(bloqueado()||Date.now()-(+localStorage.getItem("ultimo-uso")||Date.now())>=INATIVO_MS)bloquearApp();
  else{try{localStorage.setItem("ultimo-uso",String(Date.now()));}catch(e){}}
  carregarListaObras();
  setInterval(()=>{if(document.visibilityState==="visible")carregar();},10*60*1000);
  sincronizar();
})();
window.addEventListener("online",carregarListaObras);
$("b-sync").onclick=()=>sincronizar();
})();
