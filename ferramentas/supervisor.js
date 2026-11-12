(function(){
"use strict";
const $=id=>document.getElementById(id);
const CENTRAL=window.CENTRAL_FERRAMENTAS||{};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=iso=>{if(!iso)return"—";const d=new Date(iso);if(isNaN(d))return"—";return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});};
const fmtDia=iso=>{if(!iso)return"—";const d=new Date(iso);return isNaN(d)?"—":d.toLocaleDateString("pt-BR");};
const diasDesde=iso=>Math.floor((Date.now()-new Date(iso).getTime())/864e5);
const agoTxt=iso=>{const d=diasDesde(iso);return d<=0?"hoje":d===1?"há 1 dia":`há ${d} dias`;};
let toastT;function toast(m,ms){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms||3200);}
const CONDS={ok:"Conforme",dan:"Danificada",man:"Em manutenção",falta:"Faltando"};
const ST_CONF={pendente:["Aguardando aprovação","c-info"],aprovada:["Aprovada","c-ok"],devolvida:["Devolvida","c-bad"]};
const ST_OC={aberta:["Aberta","c-bad"],andamento:["Em andamento","c-warn"],resolvida:["Resolvida","c-ok"]};
const SIT={ativa:["Em uso","c-ok"],manutencao:["Em manutenção","c-warn"],baixada:["Baixada","c-mute"]};
const GRUPOS={permanente:"Kit (permanente)",almox:"Almoxarifado",individual:"Individual"};

let senha="",D=null;
const S={tab:"painel",apF:"pendente",ocF:"abertas",uq:"",uKit:"",uOpen:null,arquivos:{}};

/* ---------- central ---------- */
async function post(corpo){
  if(!CENTRAL.url)throw new Error("O painel ainda não está ligado à central (config.js).");
  const r=await fetch(CENTRAL.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(corpo)});
  return r.json();
}
async function chamar(acao,extra){
  const res=await post({painel:true,senha,acao,...(extra||{})});
  if(!res.ok&&(res.erro==="senha incorreta"||res.erro==="senha vencida")){sair(res.erro==="senha vencida"?"vencida":"");throw new Error(res.erro);}
  return res;
}
async function acao(acao,extra,okMsg){
  try{const r=await chamar(acao,extra);if(!r.ok){toast(r.erro||"Não foi possível salvar.");return null;}if(okMsg)toast(okMsg);await carregar();return r;}
  catch(e){toast(e.message||"Sem conexão com a central.");return null;}
}

/* ---------- entrar ---------- */
function telaLogin(qual){["f-login","f-primeira","f-vencida","f-recup"].forEach(id=>$(id).hidden=id!==qual);}
function msg(id,t,err){const m=$(id);m.textContent=t;m.className="msg"+(err?" err":"");}
async function entrar(){
  msg("msg-login","Entrando…");
  try{
    const r=await post({painel:true,senha,acao:"listar"});
    if(!r.ok){
      if(r.erro==="sem senha"){telaLogin("f-primeira");msg("msg-login","");return;}
      if(r.erro==="senha vencida"){telaLogin("f-vencida");return;}
      senha="";try{sessionStorage.removeItem("fer-sup-senha");}catch(e){}msg("msg-login",r.erro==="senha incorreta"?"Senha incorreta.":(r.erro||"Não consegui entrar."),true);return;
    }
    try{sessionStorage.setItem("fer-sup-senha",senha);}catch(e){}
    D=r;$("v-login").hidden=true;$("nav").hidden=false;$("main").hidden=false;$("b-sair").hidden=false;$("b-atualizar").hidden=false;msg("msg-login","");render();
  }catch(e){msg("msg-login",e.message||"Sem conexão com a central.",true);}
}
$("f-login").addEventListener("submit",e=>{e.preventDefault();senha=$("senha").value;if(!senha)return msg("msg-login","Digite a senha.",true);entrar();});
$("f-primeira").addEventListener("submit",async e=>{e.preventDefault();const a=$("p-nova").value,b=$("p-nova2").value;
  if(a.length<6)return msg("msg-primeira","A senha precisa ter pelo menos 6 caracteres.",true);if(a!==b)return msg("msg-primeira","As senhas não são iguais.",true);
  try{const r=await post({acao:"definirSenha",nova:a});if(!r.ok)return msg("msg-primeira",r.erro,true);senha=a;telaLogin("f-login");entrar();}catch(err){msg("msg-primeira",err.message,true);}});
$("f-vencida").addEventListener("submit",async e=>{e.preventDefault();const a=$("v-nova").value,b=$("v-nova2").value;
  if(a.length<6)return msg("msg-vencida","A senha precisa ter pelo menos 6 caracteres.",true);if(a!==b)return msg("msg-vencida","As senhas não são iguais.",true);
  try{const r=await post({painel:true,senha,acao:"senhaTrocar",nova:a});if(!r.ok)return msg("msg-vencida",r.erro==="senha incorreta"?"Entre de novo com a senha antiga.":r.erro,true);senha=a;telaLogin("f-login");entrar();}catch(err){msg("msg-vencida",err.message,true);}});
$("b-esqueci").onclick=async()=>{msg("msg-login","Enviando o código…");
  try{const r=await post({acao:"recuperarPedir"});if(!r.ok)return msg("msg-login",r.erro,true);telaLogin("f-recup");$("r-info").textContent=(r.jaEnviado?"Já enviamos um código há pouco para ":"Enviamos um código de 6 dígitos para ")+r.para+". Ele vale 15 minutos.";msg("msg-login","");}
  catch(e){msg("msg-login",e.message||"Sem conexão.",true);}};
$("f-recup").addEventListener("submit",async e=>{e.preventDefault();
  try{const r=await post({acao:"recuperarConfirmar",codigo:$("r-codigo").value,nova:$("r-nova").value});if(!r.ok)return msg("msg-recup",r.erro,true);
    senha=$("r-nova").value;telaLogin("f-login");entrar();}catch(err){msg("msg-recup",err.message,true);}});
$("b-voltar").onclick=()=>telaLogin("f-login");
function sair(qual){senha="";D=null;try{sessionStorage.removeItem("fer-sup-senha");}catch(e){}
  $("v-login").hidden=false;$("nav").hidden=true;$("main").hidden=true;$("b-sair").hidden=true;$("b-atualizar").hidden=true;$("senha").value="";telaLogin(qual==="vencida"?"f-vencida":"f-login");}
$("b-sair").onclick=()=>sair("");
async function carregar(){try{const r=await chamar("listar");if(r.ok){D=r;render();}}catch(e){toast(e.message||"Sem conexão.");}}
$("b-atualizar").onclick=async()=>{$("b-atualizar").textContent="Atualizando…";await carregar();$("b-atualizar").textContent="✓ Atualizado";setTimeout(()=>$("b-atualizar").textContent="Atualizar",2500);};
setInterval(()=>{if(D&&document.visibilityState==="visible"&&!document.activeElement.matches("input,textarea,select"))carregar();},5*60*1000);

/* ---------- auxiliares de dados ---------- */
const perm=()=>D.ferramentas.filter(t=>t.grupo==="permanente"&&t.ativa).sort((a,b)=>(a.item||999)-(b.item||999));
const toolById=id=>D.ferramentas.find(t=>t.id===id);
const kitById=id=>D.kits.find(k=>k.id===id);
const kitName=id=>(kitById(id)||{}).nome||"Kit removido";
const pecaBy=c=>D.pecas.find(p=>p.codigo===c);
const kitsAtivos=()=>D.kits.filter(k=>k.ativo);
const confsOrd=()=>D.conferencias.slice().sort((a,b)=>b.criado_em.localeCompare(a.criado_em));
const lastConf=kitId=>confsOrd().find(c=>c.kit===kitId);
function confPend(c){const out=[];for(const t of perm()){const it=c.itens&&c.itens[t.id];if(!it)continue;if(it.q<t.qtd||it.s!=="ok")out.push({t,it});}return out;}
function unitCodes(c,toolId){if(!c.pecas)return"";const bad=Object.entries(c.pecas).filter(([k,v])=>v!=="ok"&&(pecaBy(k)||{}).ferramenta===toolId);if(!bad.length)return"";
  const L={falta:"faltando",dan:"danificada",man:"em manutenção"};return " — "+bad.map(([k,v])=>`<code class="k">${esc(k)}</code> ${L[v]||v}`).join(", ");}
function kitState(k){
  const c=lastConf(k.id),openOc=D.ocorrencias.filter(o=>o.kit===k.id&&o.status!=="resolvida").length;
  if(!c)return {c,openOc,label:"Sem conferência",cls:"c-mute",pend:[]};
  const pend=confPend(c);
  if(diasDesde(c.criado_em)>D.prazo)return {c,openOc,pend,label:"Conferência atrasada",cls:"c-bad"};
  if(pend.length)return {c,openOc,pend,label:`${pend.length} pendência${pend.length>1?"s":""}`,cls:"c-warn"};
  return {c,openOc,pend,label:"Kit completo",cls:"c-ok"};
}
const unitsOf=kitId=>D.pecas.filter(u=>u.kit===kitId&&u.situacao!=="baixada");

/* ---------- abas ---------- */
const TABS=[["painel","Painel"],["aprov","Aprovações"],["ocs","Ocorrências"],["matriz","Matriz por kit"],["pecas","Códigos e etiquetas"],["cadastro","Cadastro"],["config","Configurações"]];
$("tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;render();window.scrollTo(0,0);});
function render(){
  if(!D)return;
  const pendAp=D.conferencias.filter(c=>c.status==="pendente").length,openOc=D.ocorrencias.filter(o=>o.status!=="resolvida").length;
  $("tabs").innerHTML=TABS.map(([id,l])=>{const n=id==="aprov"?pendAp:id==="ocs"?openOc:0;return `<button role="tab" data-tab="${id}" aria-selected="${S.tab===id}">${l}${n?`<span class="count">${n}</span>`:""}</button>`;}).join("");
  const si=D.senhaInfo,aviso=si&&si.diasRestantes<=si.avisoDias?`<div class="banner">A senha do painel vence em ${si.diasRestantes} dia(s). Troque em Configurações.</div>`:"";
  $("main").innerHTML=aviso+({painel:vPainel,aprov:vAprov,ocs:vOcs,matriz:vMatriz,pecas:vPecas,cadastro:vCadastro,config:vConfig})[S.tab]();
  (after[S.tab]||(()=>{}))();
}
const after={};

/* ---------- painel ---------- */
function vPainel(){
  const st=kitsAtivos().map(k=>({k,...kitState(k)}));
  const pendAp=D.conferencias.filter(c=>c.status==="pendente").length,openOc=D.ocorrencias.filter(o=>o.status!=="resolvida").length;
  const faltas=st.reduce((s,x)=>s+(x.pend||[]).length,0),late=st.filter(x=>x.label==="Conferência atrasada"||x.label==="Sem conferência").length;
  const ult=[...D.conferencias.map(c=>({k:"c",x:c})),...D.ocorrencias.map(o=>({k:"o",x:o}))].sort((a,b)=>b.x.criado_em.localeCompare(a.x.criado_em)).slice(0,6);
  return `<div class="stack"><div><h2>Situação dos kits</h2><p class="lead">Última conferência de cada kit, pendências e ocorrências em aberto. Prazo entre conferências: ${D.prazo} dias.</p></div>
  <div class="kpis"><div class="kpi"><span class="label">Kits</span><b>${st.length}</b></div>
  <div class="kpi ${pendAp?"alert":""}"><span class="label">Aguardando aprovação</span><b>${pendAp}</b></div>
  <div class="kpi ${openOc?"alert":""}"><span class="label">Ocorrências abertas</span><b>${openOc}</b></div>
  <div class="kpi ${faltas?"alert":""}"><span class="label">Itens com pendência</span><b>${faltas}</b></div>
  <div class="kpi ${late?"alert":""}"><span class="label">Kits fora do prazo</span><b>${late}</b></div></div>
  <div class="grid">${st.map(x=>`<div class="card stack" style="gap:10px"><div class="row"><b style="font-size:20px">${esc(x.k.nome)}</b><span class="spacer"></span><span class="chip ${x.cls}">${x.label}</span></div>
   <div class="mini"><b>Responsável:</b> ${esc(x.k.responsavel||"não definido")}${x.k.local?"<br><b>Local:</b> "+esc(x.k.local):""}</div>
   <div class="mini">${x.c?`Última conferência ${agoTxt(x.c.criado_em)} por ${esc(x.c.tecnico)} (${esc(x.c.tipo.toLowerCase())})`:"Nenhuma conferência registrada."}</div>
   ${(x.pend||[]).length?`<ul class="diffs">${x.pend.slice(0,6).map(({t,it})=>`<li>${esc(t.desc)}: ${it.q}/${t.qtd} · ${CONDS[it.s]||it.s}</li>`).join("")}${x.pend.length>6?`<li>e mais ${x.pend.length-6}</li>`:""}</ul>`:""}
   ${x.openOc?`<div><span class="chip c-bad">${x.openOc} ocorrência(s) aberta(s)</span></div>`:""}</div>`).join("")}</div>
  <div><h3 style="margin-bottom:10px">Últimos registros</h3>${ult.length?`<div class="list">${ult.map(({k,x})=>k==="c"?recConf(x,false):recOc(x,false)).join("")}</div>`:`<div class="empty">Ainda não há conferências nem ocorrências. Elas aparecem aqui assim que os técnicos começarem a usar o app.</div>`}</div></div>`;
}

/* ---------- aprovações ---------- */
function listaLonga(li){if(li.length<=8)return `<ul class="diffs">${li.join("")}</ul>`;return `<ul class="diffs">${li.slice(0,6).join("")}</ul><details><summary>Ver mais ${li.length-6}</summary><ul class="diffs">${li.slice(6).join("")}</ul></details>`;}
function recConf(c,sup){
  const [st,cls]=ST_CONF[c.status]||ST_CONF.pendente,pend=confPend(c);
  return `<div class="rec" data-conf="${esc(c.uid)}"><div class="row"><h3>${esc(c.tipo)} · ${esc(c.kit_nome)}</h3><span class="spacer"></span><span class="chip ${cls}">${st}</span></div>
  <div class="meta">${esc(c.tecnico)}${c.local?" · "+esc(c.local):""} · ${fmtDate(c.criado_em)} · ${c.lidas} de ${c.esperadas} etiquetas lidas</div>
  ${pend.length?`<div><span class="chip c-warn">${pend.length} pendência${pend.length>1?"s":""}</span>${listaLonga(pend.map(({t,it})=>`<li>${esc(t.desc)}: ${it.q}/${t.qtd} · ${CONDS[it.s]||it.s}${unitCodes(c,t.id)}</li>`))}</div>`:`<div><span class="chip c-ok">Kit completo</span></div>`}
  ${c.alheias&&c.alheias.length?`<div class="mini"><span class="chip c-warn">Peças de outro kit</span> ${c.alheias.map(x=>{const u=pecaBy(x);return `${esc(x)} (${esc((toolById(u&&u.ferramenta)||{}).desc||"")}, ${esc(kitName(u&&u.kit))})`;}).join("; ")}</div>`:""}
  ${c.obs?`<div class="mini"><b>Obs.:</b> ${esc(c.obs)}</div>`:""}
  ${c.comentario?`<div class="mini"><b>Supervisor:</b> ${esc(c.comentario)} (${fmtDate(c.revisado_em)})</div>`:""}
  ${sup?`<div>${c.assinatura?(S.arquivos[c.assinatura]?`<img class="sigimg" alt="Assinatura de ${esc(c.tecnico)}" src="${S.arquivos[c.assinatura]}">`:`<button type="button" class="linkbtn" data-arq="${esc(c.assinatura)}">Ver assinatura</button>`):`<span class="mini">Sem assinatura</span>`}</div>
   <div class="row"><input placeholder="Comentário (opcional)" data-com style="flex:1;min-width:180px">${c.status!=="aprovada"?`<button type="button" class="btn ok small" data-ap="aprovada">Aprovar</button>`:""}${c.status!=="devolvida"?`<button type="button" class="btn bad small" data-ap="devolvida">Devolver ao técnico</button>`:""}</div>`:""}
  </div>`;
}
function vAprov(){
  const f=S.apF,list=confsOrd().filter(c=>f==="todas"||c.status===f).slice(0,100);
  return `<div class="stack"><div><h2>Aprovação de conferências</h2><p class="lead">Confira as pendências e aprove, ou devolva com um comentário. O técnico vê a resposta no app.</p></div>
  <div class="seg" id="apSeg">${[["pendente","Aguardando"],["aprovada","Aprovadas"],["devolvida","Devolvidas"],["todas","Todas"]].map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${f===k}">${l}</button>`).join("")}</div>
  ${list.length?`<div class="list" id="apList">${list.map(c=>recConf(c,true)).join("")}</div>`:`<div class="empty">${f==="pendente"?"Nenhuma conferência aguardando aprovação.":"Nada nesta lista."}</div>`}</div>`;
}
async function verArquivo(id,btn){btn.textContent="Carregando…";try{const r=await chamar("arquivo",{id});if(!r.ok){btn.textContent="Arquivo não encontrado";return;}S.arquivos[id]=`data:${r.tipo};base64,${r.b64}`;render();}catch(e){btn.textContent="Sem conexão";}}
after.aprov=()=>{
  $("apSeg").onclick=e=>{const b=e.target.closest("[data-f]");if(!b)return;S.apF=b.dataset.f;render();};
  const l=$("apList");if(!l)return;
  l.addEventListener("click",async e=>{
    const a=e.target.closest("[data-arq]");if(a)return verArquivo(a.dataset.arq,a);
    const b=e.target.closest("[data-ap]");if(!b)return;const card=b.closest("[data-conf]");b.disabled=true;
    await acao("revisarConf",{uid:card.dataset.conf,status:b.dataset.ap,comentario:card.querySelector("[data-com]").value.trim()},b.dataset.ap==="aprovada"?"Conferência aprovada.":"Conferência devolvida ao técnico.");});
};

/* ---------- ocorrências ---------- */
function recOc(o,sup){
  const [st,cls]=ST_OC[o.status]||ST_OC.aberta;
  return `<div class="rec" data-oc="${esc(o.uid)}"><div class="row"><h3>${esc(o.tipo)}</h3><span class="spacer"></span><span class="chip ${cls}">${st}</span></div>
  <div>${o.codigo?`<code class="k">${esc(o.codigo)}</code> · `:""}<b>${esc(o.ferramenta_desc)}</b> · qtd ${o.qtd} · ${esc(o.kit_nome||"")}</div>
  <div class="meta">${esc(o.tecnico)} · ${fmtDate(o.criado_em)}</div>${o.descricao?`<div class="mini">${esc(o.descricao)}</div>`:""}
  ${o.foto?(S.arquivos[o.foto]?`<img class="photo" alt="Foto da ocorrência" src="${S.arquivos[o.foto]}">`:`<button type="button" class="linkbtn" data-arq="${esc(o.foto)}" style="align-self:flex-start">Ver foto</button>`):""}
  ${!sup&&o.comentario?`<div class="mini"><b>Supervisor:</b> ${esc(o.comentario)}</div>`:""}
  ${sup?`<div class="row"><input placeholder="Providência" data-com style="flex:1;min-width:180px" value="${esc(o.comentario)}"><select data-st style="width:auto">${Object.entries(ST_OC).map(([k,[l]])=>`<option value="${k}" ${o.status===k?"selected":""}>${l}</option>`).join("")}</select><button type="button" class="btn primary small" data-ocsave>Salvar</button></div>`:""}</div>`;
}
function vOcs(){
  const f=S.ocF,list=D.ocorrencias.filter(o=>f==="todas"||(f==="abertas"?o.status!=="resolvida":o.status==="resolvida")).sort((a,b)=>b.criado_em.localeCompare(a.criado_em)).slice(0,150);
  return `<div class="stack"><div><h2>Ocorrências e pedidos</h2><p class="lead">Quebras, perdas, furtos, manutenções e pedidos de material. Atualize o andamento para o técnico acompanhar.</p></div>
  <div class="seg" id="ocSeg">${[["abertas","Em aberto"],["resolvidas","Resolvidas"],["todas","Todas"]].map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${f===k}">${l}</button>`).join("")}</div>
  ${list.length?`<div class="list" id="ocList">${list.map(o=>recOc(o,true)).join("")}</div>`:`<div class="empty">Nenhuma ocorrência ${f==="abertas"?"em aberto":"nesta lista"}.</div>`}</div>`;
}
after.ocs=()=>{
  $("ocSeg").onclick=e=>{const b=e.target.closest("[data-f]");if(!b)return;S.ocF=b.dataset.f;render();};
  const l=$("ocList");if(!l)return;
  l.addEventListener("click",async e=>{
    const a=e.target.closest("[data-arq]");if(a)return verArquivo(a.dataset.arq,a);
    const b=e.target.closest("[data-ocsave]");if(!b)return;const card=b.closest("[data-oc]");b.disabled=true;
    await acao("atualizarOc",{uid:card.dataset.oc,status:card.querySelector("[data-st]").value,comentario:card.querySelector("[data-com]").value.trim()},"Ocorrência atualizada.");});
};

/* ---------- matriz ---------- */
function matriz(){const kits=kitsAtivos(),last=Object.fromEntries(kits.map(k=>[k.id,lastConf(k.id)]));
  return {kits,last,rows:perm().map(t=>({t,cells:kits.map(k=>{const c=last[k.id];return c&&c.itens?c.itens[t.id]||null:null;})}))};}
function vMatriz(){
  const {kits,last,rows}=matriz();
  return `<div class="stack"><div class="row"><div><h2>Matriz por kit</h2><p class="lead" style="margin:0">Quantidade encontrada na última conferência de cada kit, no formato da planilha.</p></div><span class="spacer"></span><button type="button" class="btn" id="xlsMatriz">Baixar Excel da matriz</button><button type="button" class="btn" id="xlsHist">Baixar histórico completo</button></div>
  <div class="tablebox"><table><thead><tr><th class="num">Item</th><th>Descrição</th><th class="num">Qtd fixa</th>${kits.map(k=>`<th class="num">${esc(k.nome)}</th>`).join("")}</tr>
  <tr><th></th><th style="text-transform:none;letter-spacing:0;font-weight:500">Última conferência</th><th></th>${kits.map(k=>`<th class="num" style="text-transform:none;letter-spacing:0;font-weight:500">${last[k.id]?fmtDia(last[k.id].criado_em):"—"}</th>`).join("")}</tr></thead>
  <tbody>${rows.map(({t,cells})=>`<tr><td class="num">${t.item||""}</td><td>${esc(t.desc)}</td><td class="num">${t.qtd}</td>${cells.map(it=>!it?`<td class="num cell-na">—</td>`:`<td class="num ${it.q<t.qtd?"cell-bad":it.s!=="ok"?"cell-warn":"cell-ok"}" title="${CONDS[it.s]||""}">${it.q}${it.s!=="ok"?" · "+(CONDS[it.s]||it.s).split(" ")[0].toLowerCase():""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
  <div class="row mini"><span class="chip c-ok">Completo</span><span class="chip c-warn">Quantidade certa, estado com problema</span><span class="chip c-bad">Faltando</span></div></div>`;
}
function carregarLib(src,glob){return window[glob]?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=()=>no(new Error("Não consegui carregar "+src));document.head.appendChild(s);});}
function baixar(blob,nome){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
const hoje=()=>new Date().toISOString().slice(0,10);
after.matriz=()=>{
  $("xlsMatriz").onclick=async()=>{try{await carregarLib("../lib/xlsx.full.min.js","XLSX");const {kits,last,rows}=matriz();
    const aoa=[["Item","Descrição","Qtd fixa",...kits.map(k=>k.nome)],["","Última conferência","",...kits.map(k=>last[k.id]?fmtDate(last[k.id].criado_em):"")],
      ...rows.map(({t,cells})=>[t.item||"",t.desc,t.qtd,...cells.map(it=>it?`${it.q} (${CONDS[it.s]||it.s})`:"")])];
    const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:6},{wch:52},{wch:9},...kits.map(()=>({wch:16}))];XLSX.utils.book_append_sheet(wb,ws,"Matriz");
    baixar(new Blob([XLSX.write(wb,{type:"array",bookType:"xlsx"})]),`matriz-ferramentas-${hoje()}.xlsx`);}catch(e){toast(e.message);}};
  $("xlsHist").onclick=async()=>{try{await carregarLib("../lib/xlsx.full.min.js","XLSX");const wb=XLSX.utils.book_new();
    const cf=confsOrd().map(c=>({"Feita em":fmtDate(c.criado_em),"Kit":c.kit_nome,"Tipo":c.tipo,"Técnico":c.tecnico,"Obra / local":c.local,"Etiquetas lidas":c.lidas,"Etiquetas esperadas":c.esperadas,"Pendências":c.pendencias,
      "Itens com pendência":confPend(c).map(({t,it})=>`${t.desc} ${it.q}/${t.qtd} ${CONDS[it.s]||it.s}`).join("; "),"Peças não lidas":Object.entries(c.pecas||{}).filter(([k,v])=>v==="falta").map(([k])=>k).join(", "),
      "Peças de outro kit":(c.alheias||[]).join(", "),"Observações":c.obs,"Situação":(ST_CONF[c.status]||[c.status])[0],"Comentário":c.comentario}));
    const oc=D.ocorrencias.slice().sort((a,b)=>b.criado_em.localeCompare(a.criado_em)).map(o=>({"Feita em":fmtDate(o.criado_em),"Tipo":o.tipo,"Ferramenta":o.ferramenta_desc,"Código":o.codigo,"Quantidade":o.qtd,"Kit":o.kit_nome,"Técnico":o.tecnico,"Descrição":o.descricao,"Situação":(ST_OC[o.status]||[o.status])[0],"Providência":o.comentario}));
    const pc=D.pecas.map(p=>({"Código":p.codigo,"Ferramenta":(toolById(p.ferramenta)||{}).desc||"","Kit":kitName(p.kit),"Situação":(SIT[p.situacao]||[p.situacao])[0],"Observação":p.obs}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(cf.length?cf:[{"Feita em":""}]),"Conferências");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(oc.length?oc:[{"Feita em":""}]),"Ocorrências");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pc),"Peças");
    baixar(new Blob([XLSX.write(wb,{type:"array",bookType:"xlsx"})]),`historico-ferramentas-${hoje()}.xlsx`);}catch(e){toast(e.message);}};
};

/* ---------- códigos e etiquetas ---------- */
function ultimasLeituras(){const m={};for(const c of confsOrd()){for(const [k,v] of Object.entries(c.pecas||{}))if(!m[k]&&(v==="ok"||v==="dan"))m[k]=c.criado_em;}return m;}
function historicoPeca(code){
  const out=[],L={ok:["Lida · conforme","c-ok"],dan:["Lida · danificada","c-bad"],falta:["Não lida (faltando)","c-bad"],man:["Em manutenção","c-warn"]};
  for(const c of D.conferencias){const v=c.pecas&&c.pecas[code];if(v)out.push({em:c.criado_em,h:`<span class="chip ${L[v][1]}">${L[v][0]}</span> ${esc(c.tipo)} do ${esc(c.kit_nome)} por ${esc(c.tecnico)}`});
    else if((c.alheias||[]).includes(code))out.push({em:c.criado_em,h:`<span class="chip c-warn">Encontrada em outro kit</span> conferência do ${esc(c.kit_nome)} por ${esc(c.tecnico)}`});}
  for(const o of D.ocorrencias)if(o.codigo===code)out.push({em:o.criado_em,h:`<span class="chip ${(ST_OC[o.status]||ST_OC.aberta)[1]}">${esc(o.tipo)}</span> ${esc(o.descricao)} (${esc(o.tecnico)})`});
  return out.sort((a,b)=>b.em.localeCompare(a.em)).slice(0,25);
}
function vPecas(){
  const LR=ultimasLeituras(),kf=S.uKit,list=D.pecas.filter(u=>!kf||u.kit===kf).sort((a,b)=>a.codigo.localeCompare(b.codigo));
  const p=S.uOpen&&pecaBy(S.uOpen);const kitOpts=sel=>D.kits.map(k=>`<option value="${k.id}" ${sel===k.id?"selected":""}>${esc(k.nome)}</option>`).join("");
  let max=0;D.pecas.forEach(x=>{const m=/^FER-(\d+)$/.exec(x.codigo);if(m)max=Math.max(max,+m[1]);});
  return `<div class="stack"><div><h2>Códigos e etiquetas</h2><p class="lead">Cada peça física tem um código sequencial (FER-0001, FER-0002…) que não muda quando ela troca de kit. ${D.pecas.length} peças cadastradas.</p></div>
  <div class="card stack"><h3>Consultar uma peça</h3><div class="scanbar"><input id="uCode" placeholder="Digite o código (ex.: FER-0012)" autocomplete="off" autocapitalize="characters"><button type="button" class="btn primary" id="uGo">Consultar</button></div>
   ${p?fichaHtml(p,LR):S.uOpen?`<div class="banner">Código ${esc(S.uOpen)} não está cadastrado.</div>`:""}</div>
  <div class="card stack"><h3>Imprimir etiquetas</h3>
   <p class="mini" style="margin:0">Folha A4 com 33 etiquetas de 63,5 × 25,4 mm (3 colunas × 11 linhas), como Pimaco A4356 / A4256. Imprima em tamanho real (100%).</p>
   <div class="fields">
    <label class="field">Quais etiquetas<select id="lbWhich"><option value="all">Todas (${D.pecas.filter(u=>u.situacao!=="baixada").length})</option>${D.kits.map(k=>`<option value="kit:${k.id}">${esc(k.nome)} (${unitsOf(k.id).length})</option>`).join("")}<option value="range">Intervalo de códigos</option></select></label>
    <label class="field" id="lbRange" hidden>De / até<span class="row" style="flex-wrap:nowrap"><input id="lbFrom" placeholder="FER-0001"><input id="lbTo" placeholder="FER-0062"></span></label>
    <label class="field">Começar na etiqueta nº<input id="lbStart" type="number" min="1" max="33" value="1" inputmode="numeric"></label>
   </div>
   <div class="row"><span class="mini" id="lbInfo"></span><span class="spacer"></span><button type="button" class="btn primary" id="lbGo">Baixar PDF das etiquetas</button></div></div>
  <div class="card stack"><h3>Cadastrar novas peças</h3>
   <div class="fields">
    <label class="field">Ferramenta<select id="nuTool">${perm().map(t=>`<option value="${t.id}">${t.item?t.item+" · ":""}${esc(t.desc)}</option>`).join("")}</select></label>
    <label class="field">Kit<select id="nuKit">${kitOpts((kitsAtivos()[0]||{}).id)}</select></label>
    <label class="field">Quantidade de peças<input id="nuQtd" type="number" min="1" max="100" value="1" inputmode="numeric"></label>
   </div>
   <div class="row"><span class="mini">Próximo código: <code class="k">FER-${String(max+1).padStart(4,"0")}</code></span><span class="spacer"></span><button type="button" class="btn" id="nuGo">Cadastrar e gerar códigos</button></div></div>
  <div class="stack"><div class="row"><h3>Peças cadastradas</h3><span class="spacer"></span>
   <select id="uKitF" style="width:auto"><option value="">Todos os kits</option>${D.kits.map(k=>`<option value="${k.id}" ${kf===k.id?"selected":""}>${esc(k.nome)}</option>`).join("")}</select>
   <input id="uSearch" placeholder="Filtrar por código ou nome" style="width:auto;min-width:200px" value="${esc(S.uq)}"></div>
  <div class="tablebox"><table><thead><tr><th>Código</th><th>Ferramenta</th><th>Kit</th><th>Situação</th><th>Última leitura</th><th></th></tr></thead><tbody id="uRows">
  ${list.map(u=>{const t=toolById(u.ferramenta);return `<tr data-u="${u.codigo}" data-q="${esc((u.codigo+" "+(t?t.desc:"")).toLowerCase())}"><td><code class="k">${u.codigo}</code></td><td style="min-width:200px">${esc(t?t.desc:"Ferramenta removida")}</td>
   <td><select data-f="kit" style="width:auto">${kitOpts(u.kit)}</select></td>
   <td><select data-f="situacao" style="width:auto">${Object.entries(SIT).map(([k,[l]])=>`<option value="${k}" ${u.situacao===k?"selected":""}>${l}</option>`).join("")}</select></td>
   <td class="mini">${LR[u.codigo]?agoTxt(LR[u.codigo]):"nunca"}</td>
   <td style="white-space:nowrap"><button type="button" class="btn small" data-usave>Salvar</button> <button type="button" class="btn small" data-uficha>Ficha</button></td></tr>`;}).join("")}
  </tbody></table></div></div></div>`;
}
function fichaHtml(u,LR){
  const t=toolById(u.ferramenta),h=historicoPeca(u.codigo),[sl,sc]=SIT[u.situacao]||SIT.ativa,k=kitById(u.kit);
  return `<div class="ficha"><div class="row"><code class="k" style="font-size:16px">${u.codigo}</code><b>${esc(t?t.desc:"")}</b><span class="spacer"></span><span class="chip ${sc}">${sl}</span></div>
  <div class="mini">${esc(kitName(u.kit))}${k&&k.responsavel?" · responsável: "+esc(k.responsavel):""} · última leitura: ${LR[u.codigo]?fmtDate(LR[u.codigo]):"nunca lida"}</div>
  ${h.length?`<ul>${h.map(x=>`<li><span class="mini">${fmtDate(x.em)}</span> ${x.h}</li>`).join("")}</ul>`:`<div class="mini" style="margin-top:6px">Sem registros ainda.</div>`}</div>`;
}
function normCode(raw){const s=String(raw||"").toUpperCase().replace(/\s+/g,"");const m=s.match(/FER-?(\d{1,6})/);if(m)return "FER-"+m[1].padStart(4,"0");if(/^\d{1,6}$/.test(s))return "FER-"+s.padStart(4,"0");return s;}
function etiquetasSel(){
  const w=$("lbWhich").value;let us=D.pecas.filter(u=>u.situacao!=="baixada");
  if(w.startsWith("kit:"))us=us.filter(u=>u.kit===w.slice(4));
  if(w==="range"){const a=normCode($("lbFrom").value||"FER-0000"),b=normCode($("lbTo").value||"FER-999999");us=D.pecas.filter(u=>u.codigo>=a&&u.codigo<=b);}
  return us.sort((a,b)=>a.codigo.localeCompare(b.codigo));
}
async function pdfEtiquetas(units,start){
  await carregarLib("../lib/jspdf.umd.min.js","jspdf");await carregarLib("lib/qrcode.js","qrcode");
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),W=63.5,H=25.4,L=7.25,T=8.8,G=2.5,Q=19;let page=0;
  units.forEach((u,i)=>{const pos=start-1+i,pg=Math.floor(pos/33);while(page<pg){doc.addPage();page++;}
    const slot=pos%33,x=L+(slot%3)*(W+G),y=T+Math.floor(slot/3)*H;
    const qr=window.qrcode(0,"M");qr.addData(u.codigo);qr.make();const n=qr.getModuleCount(),cs=Q/n,x0=x+3,y0=y+(H-Q)/2;
    doc.setFillColor(0,0,0);for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))doc.rect(x0+c*cs,y0+r*cs,cs+.02,cs+.02,"F");
    const tx=x0+Q+3,tw=x+W-tx-2.5,t=toolById(u.ferramenta);
    doc.setTextColor(0,43,73);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(u.codigo,tx,y+8.6);
    doc.setTextColor(20,20,20);doc.setFont("helvetica","normal");doc.setFontSize(7.2);doc.text(doc.splitTextToSize(t?t.desc:"",tw).slice(0,3),tx,y+12.6,{lineHeightFactor:1.15});
    doc.setTextColor(96,96,96);doc.setFontSize(5.6);doc.text("ECTAS · Controle de ferramentas",tx,y+H-3.2);});
  return doc.output("blob");
}
after.pecas=()=>{
  const go=()=>{const v=$("uCode").value.trim();if(!v)return;S.uOpen=normCode(v);render();};
  $("uGo").onclick=go;$("uCode").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();go();}});
  const info=()=>{const n=etiquetasSel().length,st=Math.max(1,Math.min(33,+$("lbStart").value||1)),f=Math.ceil((n+st-1)/33)||0;$("lbInfo").textContent=`${n} etiqueta${n===1?"":"s"} · ${f} folha${f===1?"":"s"}`;};
  $("lbWhich").onchange=()=>{$("lbRange").hidden=$("lbWhich").value!=="range";info();};["lbFrom","lbTo","lbStart"].forEach(id=>$(id).oninput=info);info();
  $("lbGo").onclick=async()=>{const us=etiquetasSel();if(!us.length)return toast("Nenhuma etiqueta nessa seleção.");const b=$("lbGo");b.disabled=true;b.textContent="Gerando PDF…";
    try{const w=$("lbWhich").value,nm=w.startsWith("kit:")?kitName(w.slice(4)).replace(/\s+/g,"-").toLowerCase():w==="range"?`${us[0].codigo}-a-${us[us.length-1].codigo}`:"todas";
      baixar(await pdfEtiquetas(us,Math.max(1,Math.min(33,+$("lbStart").value||1))),`etiquetas-ferramentas-${nm}.pdf`);}catch(e){toast(e.message||"Não consegui gerar o PDF.");}
    finally{b.disabled=false;b.textContent="Baixar PDF das etiquetas";}};
  $("nuGo").onclick=async()=>{const b=$("nuGo");b.disabled=true;const r=await acao("pecasCriar",{ferramenta:$("nuTool").value,kit:$("nuKit").value,qtd:+$("nuQtd").value||1});
    if(r){toast(`Cadastrado: ${r.codigos[0]}${r.codigos.length>1?" a "+r.codigos[r.codigos.length-1]:""}. Gere as etiquetas pelo intervalo de códigos.`,5000);$("lbWhich").value="range";$("lbRange").hidden=false;$("lbFrom").value=r.codigos[0];$("lbTo").value=r.codigos[r.codigos.length-1];info();}else b.disabled=false;};
  $("uKitF").onchange=e=>{S.uKit=e.target.value;render();};
  const filt=()=>{const q=S.uq.trim().toLowerCase();document.querySelectorAll("#uRows tr[data-u]").forEach(tr=>tr.hidden=!!q&&!tr.dataset.q.includes(q));};
  $("uSearch").oninput=e=>{S.uq=e.target.value;filt();};filt();
  $("uRows").addEventListener("click",async e=>{const tr=e.target.closest("tr[data-u]");if(!tr)return;
    if(e.target.closest("[data-uficha]")){S.uOpen=tr.dataset.u;render();window.scrollTo({top:0,behavior:"smooth"});return;}
    if(e.target.closest("[data-usave]")){const v={codigo:tr.dataset.u};tr.querySelectorAll("[data-f]").forEach(i=>v[i.dataset.f]=i.value);await acao("pecaSalvar",{peca:v},`${tr.dataset.u} salva.`);}});
};

/* ---------- cadastro: kits, ferramentas e técnicos ---------- */
function vCadastro(){
  const ts=D.tecnicos;
  const tools=D.ferramentas.slice().sort((a,b)=>(a.grupo>b.grupo?1:a.grupo<b.grupo?-1:(a.item||999)-(b.item||999)));
  return `<div class="stack"><div><h2>Cadastro</h2><p class="lead">Técnicos (usuário e senha do app), kits e a lista padrão de ferramentas.</p></div>
  <div class="card stack"><div class="row"><h3>Técnicos (usuários do app)</h3><span class="spacer"></span><button type="button" class="btn small" id="addTec">Novo técnico</button></div>
   <p class="mini" style="margin:0">O técnico entra no app com usuário e senha. Trocar a senha ou desativar encerra o acesso dele na hora.</p>
   ${ts.length?`<div class="tablebox"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Situação</th><th></th></tr></thead><tbody id="tecRows">${ts.map(t=>`<tr data-login="${esc(t.login)}"><td><code class="k">${esc(t.login)}</code></td><td>${esc(t.nome)}</td><td>${t.ativo?`<span class="chip c-ok">Ativo</span>`:`<span class="chip c-mute">Desativado</span>`}</td><td><button type="button" class="btn small" data-edtec>Editar / senha</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Nenhum técnico cadastrado. Cadastre o primeiro para ele poder entrar no app.</div>`}</div>
  <div class="card stack"><div class="row"><h3>Kits</h3><span class="spacer"></span><button type="button" class="btn small" id="addKit">Novo kit</button></div>
   <div class="tablebox"><table><thead><tr><th>Kit</th><th>Responsável</th><th>Local / equipe</th><th>Técnicos liberados</th><th>Situação</th><th></th></tr></thead><tbody id="kitRows">
   ${D.kits.map(k=>`<tr data-k="${k.id}"><td><b>${esc(k.nome)}</b></td><td>${esc(k.responsavel||"—")}</td><td>${esc(k.local||"—")}</td><td class="mini">${k.tecnicos.length?esc(k.tecnicos.map(l=>(ts.find(t=>t.login===l)||{}).nome||l).join(", ")):"Todos"}</td><td>${k.ativo?`<span class="chip c-ok">Ativo</span>`:`<span class="chip c-mute">Inativo</span>`}</td><td><button type="button" class="btn small" data-edkit>Editar</button></td></tr>`).join("")}
   </tbody></table></div></div>
  <div class="card stack"><div class="row"><h3>Ferramentas (${D.ferramentas.length})</h3><span class="spacer"></span><button type="button" class="btn small" id="addTool">Nova ferramenta</button></div>
   <div class="tablebox"><table><thead><tr><th class="num">Item</th><th>Descrição</th><th class="num">Qtd</th><th>Grupo</th><th>Situação</th><th></th></tr></thead><tbody id="toolRows">
   ${tools.map(t=>`<tr data-t="${t.id}"><td style="width:74px"><input data-f="item" type="number" value="${t.item??""}"></td><td style="min-width:240px"><input data-f="desc" value="${esc(t.desc)}"></td><td style="width:82px"><input data-f="qtd" type="number" min="0" value="${t.qtd}"></td>
    <td style="width:170px"><select data-f="grupo">${Object.entries(GRUPOS).map(([k,l])=>`<option value="${k}" ${t.grupo===k?"selected":""}>${l}</option>`).join("")}</select></td>
    <td style="width:130px"><select data-f="ativa"><option value="1" ${t.ativa?"selected":""}>Ativa</option><option value="0" ${!t.ativa?"selected":""}>Inativa</option></select></td>
    <td style="white-space:nowrap"><button type="button" class="btn small" data-savet>Salvar</button> <button type="button" class="btn small bad" data-delt>Excluir</button></td></tr>`).join("")}
   </tbody></table></div></div></div>`;
}
function abrirModal(html){$("modal-box").innerHTML=html;$("modal").hidden=false;}
function fecharModal(){$("modal").hidden=true;$("modal-box").innerHTML="";}
$("modal").addEventListener("click",e=>{if(e.target.id==="modal"||e.target.closest("[data-fechar]"))fecharModal();});
function formTec(t){
  abrirModal(`<h3>${t?"Editar técnico":"Novo técnico"}</h3><form id="fTec" class="stack" style="gap:12px">
   <label class="field">Usuário (letras minúsculas, números, ponto ou hífen)<input id="tLogin" value="${esc(t?t.login:"")}" autocapitalize="none" spellcheck="false" placeholder="joao.silva"></label>
   <label class="field">Nome completo (sai nas conferências)<input id="tNome" value="${esc(t?t.nome:"")}"></label>
   <label class="field">${t?"Nova senha (deixe em branco para manter)":"Senha (mínimo 6 caracteres)"}<input id="tSenha" type="text" autocomplete="off"></label>
   <label class="check"><input type="checkbox" id="tAtivo" ${!t||t.ativo?"checked":""}> Ativo (desmarque para bloquear o acesso)</label>
   <div class="msg" id="tMsg"></div>
   <div class="row"><button type="button" class="btn" data-fechar>Cancelar</button><span class="spacer"></span><button type="submit" class="btn primary">Salvar</button></div></form>
   <p class="mini" style="margin:0">Passe o usuário e a senha ao técnico em particular, junto com o endereço do app: diariodeobra.github.io/ferramentas</p>`);
  $("fTec").addEventListener("submit",async e=>{e.preventDefault();
    const r=await chamar("usuarioSalvar",{usuario:{login:$("tLogin").value.trim().toLowerCase(),loginOriginal:t?t.login:"",nome:$("tNome").value.trim(),senha:$("tSenha").value,ativo:$("tAtivo").checked}}).catch(err=>({ok:false,erro:err.message}));
    if(!r.ok){$("tMsg").textContent=r.erro;$("tMsg").className="msg err";return;}fecharModal();toast("Técnico salvo.");carregar();});
}
function formKit(k){
  abrirModal(`<h3>${k?"Editar "+esc(k.nome):"Novo kit"}</h3><form id="fKit" class="stack" style="gap:12px">
   <div class="fields"><label class="field">Nome do kit<input id="kNome" value="${esc(k?k.nome:"KIT "+(D.kits.length+1))}"></label><label class="field">Ordem<input id="kOrdem" type="number" value="${k?k.ordem:D.kits.length+1}"></label></div>
   <div class="fields"><label class="field">Responsável<input id="kResp" value="${esc(k?k.responsavel:"")}" placeholder="Nome do técnico"></label><label class="field">Local / equipe<input id="kLocal" value="${esc(k?k.local:"")}"></label></div>
   <div class="field"><span class="label">Técnicos que podem conferir (nenhum marcado = todos)</span>
    ${D.tecnicos.length?D.tecnicos.map(t=>`<label class="check"><input type="checkbox" data-tec="${esc(t.login)}" ${k&&k.tecnicos.includes(t.login)?"checked":""}> ${esc(t.nome)} (${esc(t.login)})</label>`).join(""):`<span class="mini">Cadastre os técnicos primeiro.</span>`}</div>
   <label class="check"><input type="checkbox" id="kAtivo" ${!k||k.ativo?"checked":""}> Ativo</label>
   <div class="msg" id="kMsg"></div>
   <div class="row"><button type="button" class="btn" data-fechar>Cancelar</button><span class="spacer"></span><button type="submit" class="btn primary">Salvar</button></div></form>`);
  $("fKit").addEventListener("submit",async e=>{e.preventDefault();
    const tec=[...document.querySelectorAll("[data-tec]")].filter(i=>i.checked).map(i=>i.dataset.tec);
    const r=await chamar("kitSalvar",{kit:{id:k?k.id:"",nome:$("kNome").value,ordem:+$("kOrdem").value,responsavel:$("kResp").value,local:$("kLocal").value,tecnicos:tec,ativo:$("kAtivo").checked}}).catch(err=>({ok:false,erro:err.message}));
    if(!r.ok){$("kMsg").textContent=r.erro;$("kMsg").className="msg err";return;}fecharModal();toast("Kit salvo.");carregar();});
}
after.cadastro=()=>{
  $("addTec").onclick=()=>formTec(null);$("addKit").onclick=()=>formKit(null);
  const tr=$("tecRows");if(tr)tr.addEventListener("click",e=>{const b=e.target.closest("[data-edtec]");if(b)formTec(D.tecnicos.find(t=>t.login===b.closest("tr").dataset.login));});
  $("kitRows").addEventListener("click",e=>{const b=e.target.closest("[data-edkit]");if(b)formKit(kitById(b.closest("tr").dataset.k));});
  $("addTool").onclick=()=>{const next=Math.max(0,...perm().map(t=>t.item||0))+1;acao("ferramentaSalvar",{ferramenta:{item:next,desc:"Nova ferramenta",qtd:1,grupo:"permanente"}},"Ferramenta adicionada no fim da lista. Edite a descrição e salve.");};
  $("toolRows").addEventListener("click",async e=>{const row=e.target.closest("tr[data-t]");if(!row)return;
    if(e.target.closest("[data-savet]")){const v={id:row.dataset.t};row.querySelectorAll("[data-f]").forEach(i=>v[i.dataset.f]=i.value.trim());v.ativa=v.ativa==="1";v.item=v.item===""?"":Number(v.item);v.qtd=Math.max(0,Number(v.qtd)||0);
      if(!v.desc)return toast("Informe a descrição.");await acao("ferramentaSalvar",{ferramenta:v},"Ferramenta salva.");}
    const del=e.target.closest("[data-delt]");if(del){if(del.dataset.c!=="1"){del.dataset.c="1";del.textContent="Confirmar exclusão";return;}await acao("ferramentaExcluir",{id:row.dataset.t},"Ferramenta excluída.");}});
};

/* ---------- configurações ---------- */
function vConfig(){
  const c=D.config||{},si=D.senhaInfo||{},b=c.backup||{};
  return `<div class="stack"><div><h2>Configurações</h2></div>
  <div class="card stack"><h3>Aviso diário por e-mail</h3><p class="mini" style="margin:0">De segunda a sábado: kits com conferência atrasada, pendências da última conferência, conferências a aprovar e ocorrências abertas.</p>
   <div class="fields"><label class="field">E-mails (separados por vírgula)<input id="cEmails" value="${esc(c.emails||"")}"></label><label class="field">Horário<select id="cHora">${Array.from({length:24},(_,h)=>`<option value="${h}" ${c.hora===h?"selected":""}>${String(h).padStart(2,"0")}:00</option>`).join("")}</select></label></div>
   <div class="row"><span class="chip ${c.ativo?"c-ok":"c-mute"}">${c.ativo?"Ativo":"Desligado"}</span><span class="spacer"></span><button type="button" class="btn" id="cTeste">Enviar teste agora</button><button type="button" class="btn primary" id="cSalvar">Salvar aviso</button></div></div>
  <div class="card stack"><h3>Senha do painel</h3><p class="mini" style="margin:0">Trocada em ${fmtDia(si.trocadaEm)} · vence em ${fmtDia(si.venceEm)} (${si.diasRestantes} dia(s)). A senha vence a cada ${si.validadeDias||90} dias.</p>
   <div class="fields"><label class="field">Nova senha<input id="sNova" type="password" autocomplete="new-password"></label><label class="field">Repita<input id="sNova2" type="password" autocomplete="new-password"></label></div>
   <div class="row"><span class="spacer"></span><button type="button" class="btn primary" id="sTrocar">Trocar senha</button></div>
   <label class="field">E-mail de recuperação (recebe o código de "Esqueci minha senha")<input id="rEmail" value="${esc(c.recupEmail||"")}" placeholder="${esc(c.recupPadrao||"")}"></label>
   <div class="row"><span class="spacer"></span><button type="button" class="btn" id="rSalvar">Salvar e-mail</button></div></div>
  <div class="card stack"><h3>Cópia de segurança</h3><p class="mini" style="margin:0">Toda segunda-feira às 3h a planilha é copiada para o Google Drive (ficam as 12 mais recentes). Última cópia: ${b.ultimo?fmtDate(b.ultimo):"ainda não feita"}.</p>
   <div class="row"><span class="chip ${b.ativo?"c-ok":"c-mute"}">${b.ativo?"Automática ligada":"Automática desligada"}</span><span class="spacer"></span>${b.pasta?`<a class="btn" href="${esc(b.pasta)}" target="_blank" rel="noopener">Abrir pasta de cópias</a>`:""}<button type="button" class="btn" id="bAgora">Fazer cópia agora</button></div></div>
  <div class="card stack"><h3>Planilha central</h3><p class="mini" style="margin:0">Todos os dados ficam numa planilha do Google, na conta da central.</p><div class="row"><a class="btn" href="${esc(D.planilha||"#")}" target="_blank" rel="noopener">Abrir planilha</a></div></div></div>`;
}
after.config=()=>{
  $("cSalvar").onclick=()=>acao("configSalvar",{config:{emails:$("cEmails").value,hora:+$("cHora").value}},"Aviso salvo.");
  $("cTeste").onclick=async()=>{try{const r=await chamar("emailTeste");toast(r.ok?"E-mail de teste enviado para "+r.enviado+".":r.erro,5000);}catch(e){toast(e.message);}};
  $("sTrocar").onclick=async()=>{const a=$("sNova").value,b=$("sNova2").value;if(a.length<6)return toast("A senha precisa ter pelo menos 6 caracteres.");if(a!==b)return toast("As senhas não são iguais.");
    try{const r=await chamar("senhaTrocar",{nova:a});if(!r.ok)return toast(r.erro);senha=a;try{sessionStorage.setItem("fer-sup-senha",a);}catch(e){}toast("Senha trocada.");carregar();}catch(e){toast(e.message);}};
  $("rSalvar").onclick=()=>acao("recupEmailSalvar",{email:$("rEmail").value.trim()},"E-mail de recuperação salvo.");
  $("bAgora").onclick=()=>acao("backupAgora",{},"Cópia de segurança feita.");
};

/* ---------- início ---------- */
try{const s=sessionStorage.getItem("fer-sup-senha");if(s){senha=s;entrar();}}catch(e){}
if(!CENTRAL.url)msg("msg-login","O painel ainda não está ligado à central. Siga o passo a passo de instalação.",true);
})();
