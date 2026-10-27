(function(){
"use strict";
const $=id=>document.getElementById(id);
const CENTRAL=window.CENTRAL||{};
const FUNCOES=[["lider","Líder","--s1"],["montador","Montador","--s2"],["auxiliar","Auxiliar","--s3"],["outros","Outros","--s4"]];
let senha="",todos=[],planilha="";

/* ---------- utilidades ---------- */
function esc(s){const d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML;}
const num=v=>parseInt(v,10)||0;
const dataStr=v=>{if(!v)return"";const s=String(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):"";};
function fmt(s){if(!s)return"-";const[y,m,d]=s.split("-");return `${d}/${m}/${y}`;}
function dia(s){const[y,m,d]=s.split("-");return new Date(+y,+m-1,+d);}
function iso(d){const z=new Date(d);z.setMinutes(z.getMinutes()-z.getTimezoneOffset());return z.toISOString().slice(0,10);}
const hoje=()=>iso(new Date());
const semIcone=t=>String(t||"").replace(/^[^\p{L}]+/u,"");
const ruim=t=>/chuva|impratic/i.test(t||"");
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
function obraNome(r){const c=canon[obraChave(r)]||r;return [c.idobra,c.obra].map(v=>String(v??"").trim()).filter(Boolean).join(" - ")+(c.local?" / "+c.local:"");}
function cor(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function msg(id,t,err){const m=$(id);m.textContent=t;m.className="msg"+(err?" err":"");}

/* ---------- acesso ---------- */
async function chamar(params){
  if(!CENTRAL.url)throw new Error("A central ainda não foi configurada.");
  const u=CENTRAL.url+"?"+new URLSearchParams({...params,senha}).toString();
  const r=await fetch(u);const j=await r.json();
  if(!j.ok)throw new Error(j.erro||"falha");
  return j;
}
async function enviar(corpo){
  if(!CENTRAL.url)throw new Error("A central ainda não foi configurada.");
  const r=await fetch(CENTRAL.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...corpo,senha})});
  const j=await r.json();if(!j.ok)throw new Error(j.erro||"falha");return j;
}
async function entrar(){
  senha=$("senha").value;
  if(!senha){msg("msg-login","Digite a senha.",true);return;}
  msg("msg-login","Entrando…");
  try{
    try{await carregar();}
    catch(e){
      if(e.message!=="sem senha")throw e;
      if(senha.length<6){msg("msg-login","Primeiro acesso: crie uma senha com pelo menos 6 caracteres.",true);return;}
      await chamar({acao:"definirSenha",nova:senha});
      await carregar();
    }
    try{sessionStorage.setItem("sup-senha",senha);}catch(e){}
    $("v-login").hidden=true;$("v-painel").hidden=false;msg("msg-login","");
  }catch(e){msg("msg-login",e.message==="senha incorreta"?"Senha incorreta.":"Não consegui abrir: "+e.message,true);}
}
$("b-entrar").onclick=entrar;
$("senha").addEventListener("keydown",e=>{if(e.key==="Enter")entrar();});
$("b-sair").onclick=()=>{try{sessionStorage.removeItem("sup-senha");}catch(e){}senha="";todos=[];$("v-painel").hidden=true;$("v-login").hidden=false;$("senha").value="";};

async function carregar(){
  const j=await chamar({acao:"listar"});
  todos=(j.rdos||[]).map(r=>({...r,data:dataStr(r.data),total:num(r.total)})).filter(r=>r.data);
  montarCanon(todos);
  planilha=j.planilha||"";
  if(planilha){$("link-planilha").href=planilha;$("link-planilha").hidden=false;}
  $("atualizado").textContent="Atualizado às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+" · "+todos.length+" RDOs na central";
  montarFiltros();render();
  carregarObras();carregarAviso();
}

/* ---------- cadastro de obras ---------- */
let cadObras=[],editandoId=null;
async function carregarObras(){
  try{const j=await chamar({acao:"obrasTodas"});cadObras=j.obras||[];renderObras2();}
  catch(e){msg("msg-obras","Não consegui carregar as obras: "+e.message,true);}
}
function renderObras2(){
  const at=cadObras.filter(o=>o.ativa).length;
  $("n-obras").textContent="("+at+" ativa"+(at!==1?"s":"")+(cadObras.length>at?", "+(cadObras.length-at)+" inativa"+(cadObras.length-at>1?"s":""):"")+")";
  $("t-cad-obras").innerHTML=cadObras.length?cadObras.map((o,i)=>`<tr data-i="${i}"><td>${esc(o.id)}</td><td>${esc(o.obra)}</td><td>${esc(o.local)}</td><td>${o.ativa?'<span class="pill ok">Ativa</span>':'<span class="pill">Inativa</span>'}</td><td><button type="button" class="linkbtn" data-ed="${i}">Editar</button></td></tr>`).join(""):'<tr><td colspan="5" class="status">Nenhuma obra cadastrada. Clique em + Nova obra.</td></tr>';
  $("t-cad-obras").querySelectorAll("[data-ed]").forEach(b=>b.onclick=e=>{e.stopPropagation();abrirObra(cadObras[+b.dataset.ed]);});
}
function abrirObra(o){
  editandoId=o?o.id:null;
  $("o-id").value=o?o.id:"";$("o-nome").value=o?o.obra:"";$("o-local").value=o?o.local:"";$("o-ativa").value=!o||o.ativa?"1":"0";
  $("f-obra-form").hidden=false;$("b-obra-salvar").textContent=o?"Salvar alterações":"Cadastrar obra";msg("msg-obras","");$("o-id").focus();
}
$("b-nova-obra").onclick=()=>abrirObra(null);
$("b-obra-cancelar").onclick=()=>{$("f-obra-form").hidden=true;editandoId=null;msg("msg-obras","");};
$("f-obra-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const obra={id:$("o-id").value.trim(),obra:$("o-nome").value.trim(),local:$("o-local").value.trim(),ativa:$("o-ativa").value==="1",idOriginal:editandoId||""};
  if(!obra.id||!obra.obra){msg("msg-obras","Informe o ID e o nome da obra.",true);return;}
  const b=$("b-obra-salvar");b.disabled=true;msg("msg-obras","Salvando…");
  try{const j=await enviar({acao:"obraSalvar",obra});cadObras=j.obras||[];renderObras2();$("f-obra-form").hidden=true;editandoId=null;msg("msg-obras","Obra "+obra.id+" salva. Os celulares recebem a lista nova ao abrir o app.");}
  catch(err){msg("msg-obras",err.message,true);}
  finally{b.disabled=false;}
});

/* ---------- trocar senha ---------- */
$("f-senha").addEventListener("submit",async e=>{
  e.preventDefault();
  const nova=$("s-nova").value,conf=$("s-conf").value;
  if(nova.length<6){msg("msg-senha","A nova senha precisa ter pelo menos 6 caracteres.",true);return;}
  if(nova!==conf){msg("msg-senha","As duas senhas não são iguais.",true);return;}
  if(nova===senha){msg("msg-senha","A nova senha é igual à atual.",true);return;}
  const b=$("b-senha");b.disabled=true;msg("msg-senha","Trocando…");
  try{
    await enviar({acao:"senhaTrocar",nova});
    senha=nova;try{sessionStorage.setItem("sup-senha",nova);}catch(err){}
    $("s-nova").value="";$("s-conf").value="";
    msg("msg-senha","Senha trocada. Use a nova senha nos próximos acessos.");
  }catch(err){msg("msg-senha","Não consegui trocar: "+err.message,true);}
  finally{b.disabled=false;}
});

/* ---------- aviso diário por e-mail ---------- */
(function(){const s=$("a-hora");for(let h=5;h<=12;h++)s.insertAdjacentHTML("beforeend",`<option value="${h}">${String(h).padStart(2,"0")}:00</option>`);s.value="7";})();
function mostrarAviso(c){
  $("a-emails").value=c.emails||"";$("a-hora").value=String(c.hora||7);
  $("aviso-status").innerHTML=c.ativo&&c.emails?`<span class="pill ok">✓ Ativo</span> todo dia às ${String(c.hora).padStart(2,"0")}:00 para ${esc(c.emails)}`:'<span class="pill">Desligado</span> cadastre pelo menos um e-mail e salve.';
}
async function carregarAviso(){
  try{const j=await chamar({acao:"config"});mostrarAviso(j.config||{});}
  catch(e){msg("msg-aviso","Não consegui carregar o aviso: "+e.message,true);}
}
$("f-aviso").addEventListener("submit",async e=>{
  e.preventDefault();msg("msg-aviso","Salvando…");
  try{const j=await enviar({acao:"configSalvar",config:{emails:$("a-emails").value,hora:$("a-hora").value}});mostrarAviso(j.config||{});msg("msg-aviso","Aviso salvo.");}
  catch(err){msg("msg-aviso","Não consegui salvar: "+err.message,true);}
});
$("b-aviso-teste").onclick=async()=>{
  const b=$("b-aviso-teste");b.disabled=true;msg("msg-aviso","Enviando…");
  try{const j=await enviar({acao:"emailTeste"});msg("msg-aviso","E-mail de teste enviado para "+j.enviado+". "+(j.faltam?j.faltam+" obra(s) sem RDO ontem.":"Todas as obras ativas enviaram ontem."));}
  catch(err){msg("msg-aviso","Não consegui enviar: "+err.message,true);}
  finally{b.disabled=false;}
};
$("b-atualizar").onclick=async()=>{try{msg("msg","Atualizando…");await carregar();msg("msg","");}catch(e){msg("msg","Não consegui atualizar: "+e.message,true);}};

/* ---------- filtros ---------- */
function montarFiltros(){
  const sel=(id,vals,primeira)=>{const s=$(id),cur=s.value;s.innerHTML=`<option value="">${primeira}</option>`+vals.map(v=>`<option${v===cur?" selected":""}>${esc(v)}</option>`).join("");};
  const so=$("f-obra"),cur=so.value;
  const obras=[...new Set(todos.map(obraChave))].map(k=>[k,obraNome(canon[k]||{})]).sort((a,b)=>a[1].localeCompare(b[1],"pt"));
  so.innerHTML='<option value="">Todas as obras</option>'+obras.map(([k,n])=>`<option value="${esc(k)}"${k===cur?" selected":""}>${esc(n)}</option>`).join("");
  sel("f-resp",[...new Set(todos.map(r=>r.resp).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt")),"Todos");
  if(!$("f-de").value){const d=new Date();d.setDate(1);$("f-de").value=iso(d);}
  if(!$("f-ate").value)$("f-ate").value=hoje();
}
["f-obra","f-resp","f-de","f-ate"].forEach(id=>$(id).addEventListener("change",render));
function filtrados(){
  const o=$("f-obra").value,p=$("f-resp").value,de=$("f-de").value,ate=$("f-ate").value;
  return todos.filter(r=>(!o||obraChave(r)===o)&&(!p||r.resp===p)&&(!de||r.data>=de)&&(!ate||r.data<=ate))
    .sort((a,b)=>b.data.localeCompare(a.data)||num(b.rdo)-num(a.rdo));
}

/* ---------- painel ---------- */
function render(){
  const L=filtrados();
  // indicadores
  const obras=new Set(L.map(obraChave));
  const hd=L.reduce((s,r)=>s+r.total,0);
  const diasRuins=L.filter(r=>ruim(r.clima_manha)||ruim(r.clima_tarde)).length;
  const ocor=L.filter(r=>String(r.ocor||"").trim()).length;
  const kpi=(v,t,s)=>`<div class="kpi"><span>${t}</span><b>${v}</b>${s?`<small>${s}</small>`:""}</div>`;
  $("kpis").innerHTML=
    kpi(L.length,"RDOs recebidos",obras.size+" obra"+(obras.size!==1?"s":""))+
    kpi(hd.toLocaleString("pt-BR"),"Homem-dia","soma do efetivo")+
    kpi(L.length?(hd/L.length).toFixed(1).replace(".",","):"0","Efetivo médio","pessoas por RDO")+
    kpi(diasRuins,"Chuva ou impraticável","RDOs com tempo ruim")+
    kpi(ocor,"Com ocorrência","ver detalhes na lista");
  renderFaltas(L);renderGrafico(L);renderObras(L);renderLista(L);
}

function renderFaltas(L){
  const ontem=(()=>{const d=new Date();d.setDate(d.getDate()-1);return iso(d);})();
  const de=$("f-de").value,ate=[$("f-ate").value||ontem,ontem].sort()[0];
  const porObra={};
  L.forEach(r=>{const k=obraChave(r);(porObra[k]=porObra[k]||new Set()).add(r.data);});
  // considera também obras com RDO antes do período, para não esquecer obra parada
  const linhas=[];
  Object.entries(porObra).forEach(([o,datas])=>{
    const ini=[...datas].sort()[0];
    const comeco=de&&de>ini?de:ini;
    const faltam=[];
    for(let d=dia(comeco);iso(d)<=ate;d.setDate(d.getDate()+1)){
      if(d.getDay()===0)continue;
      const s=iso(d);if(!datas.has(s))faltam.push(s);
    }
    if(faltam.length)linhas.push(`<div><b>${esc(obraNome(canon[o]||{}))}</b> <span class="status">${faltam.length} dia${faltam.length>1?"s":""}:</span> ${faltam.slice(-12).map(s=>`<span class="d">${fmt(s).slice(0,5)}</span>`).join(" ")}${faltam.length>12?" <span class='status'>…</span>":""}</div>`);
  });
  $("c-faltas").hidden=!linhas.length;
  $("faltas").innerHTML=linhas.join("");
}

function renderGrafico(L){
  $("legenda").innerHTML=FUNCOES.map(([,n,v])=>`<span><i style="background:var(${v})"></i>${n}</span>`).join("");
  const box=$("grafico");
  const porDia={};
  L.forEach(r=>{const d=porDia[r.data]=porDia[r.data]||{lider:0,montador:0,auxiliar:0,outros:0,n:0};FUNCOES.forEach(([k])=>d[k]+=num(r[k]));d.n++;});
  const dias=Object.keys(porDia).sort();
  if(!dias.length){box.innerHTML='<p class="status">Nenhum RDO no período escolhido.</p>';return;}
  const tot=d=>FUNCOES.reduce((s,[k])=>s+porDia[d][k],0);
  const max=Math.max(1,...dias.map(tot));
  const passo=max<=10?2:max<=25?5:max<=60?10:20, topo=Math.ceil(max/passo)*passo;
  const H=220,ml=34,mb=28,mt=10,bw=Math.max(10,Math.min(34,Math.floor(640/dias.length)-6)),gap=6;
  const W=Math.max(box.clientWidth||600,ml+dias.length*(bw+gap)+10);
  const y=v=>mt+(H-mt-mb)*(1-v/topo);
  let s=`<svg width="${W}" height="${H}" role="img" aria-label="Efetivo por dia, empilhado por função">`;
  for(let v=0;v<=topo;v+=passo){s+=`<line x1="${ml}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/><text x="${ml-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`;}
  const cada=Math.ceil(dias.length/12);
  dias.forEach((d,i)=>{
    const x=ml+6+i*(bw+gap);let base=0;const segs=FUNCOES.filter(([k])=>porDia[d][k]>0);
    segs.forEach(([k,,v],j)=>{
      const val=porDia[d][k],y0=y(base),y1=y(base+val),h=Math.max(0,y0-y1-(j>0?2:0)),top=j===segs.length-1;
      const r=top?Math.min(4,h/2,bw/2):0,yy=y1+(j>0?0:0);
      s+=top?`<path d="M${x},${yy+h} V${yy+r} Q${x},${yy} ${x+r},${yy} H${x+bw-r} Q${x+bw},${yy} ${x+bw},${yy+r} V${yy+h} Z" fill="var(${v})"/>`
            :`<rect x="${x}" y="${yy}" width="${bw}" height="${h}" fill="var(${v})"/>`;
      base+=val;
    });
    if(i%cada===0)s+=`<text x="${x+bw/2}" y="${H-10}" text-anchor="middle">${fmt(d).slice(0,5)}</text>`;
    s+=`<rect class="hit" data-d="${d}" x="${x-gap/2}" y="${mt}" width="${bw+gap}" height="${H-mt-mb}" fill="transparent"/>`;
  });
  s+="</svg>";
  box.innerHTML=s+'<div class="tip" hidden></div>';
  const tip=box.querySelector(".tip");
  box.querySelectorAll(".hit").forEach(h=>{
    h.addEventListener("mouseenter",()=>{const d=h.dataset.d,p=porDia[d];
      tip.innerHTML=`<b>${fmt(d)}</b> · ${tot(d)} pessoas<br>`+FUNCOES.map(([k,n,v])=>`<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(${v})"></span> ${n}: ${p[k]}`).join("<br>")+`<br><span class="status">${p.n} RDO${p.n>1?"s":""}</span>`;
      tip.hidden=false;const bx=+h.getAttribute("x");tip.style.left=Math.min(bx+20,box.scrollWidth-180)+"px";tip.style.top="8px";});
    h.addEventListener("mouseleave",()=>tip.hidden=true);
  });
}

function renderObras(L){
  const g={};
  L.forEach(r=>{const o=obraChave(r),x=g[o]=g[o]||{n:0,ult:"",hd:0,ruim:0,oc:0};x.n++;x.hd+=r.total;if(r.data>x.ult)x.ult=r.data;if(ruim(r.clima_manha)||ruim(r.clima_tarde))x.ruim++;if(String(r.ocor||"").trim())x.oc++;});
  const linhas=Object.entries(g).sort((a,b)=>obraNome(canon[a[0]]||{}).localeCompare(obraNome(canon[b[0]]||{}),"pt"));
  $("t-obras").innerHTML=linhas.length?linhas.map(([o,x])=>`<tr data-o="${esc(o)}"><td>${esc(obraNome(canon[o]||{}))}</td><td class="n">${x.n}</td><td>${fmt(x.ult)}</td><td class="n">${x.hd}</td><td class="n">${(x.hd/x.n).toFixed(1).replace(".",",")}</td><td class="n">${x.ruim}</td><td class="n">${x.oc}</td></tr>`).join(""):'<tr><td colspan="7" class="status">Nenhum RDO no período.</td></tr>';
  $("t-obras").querySelectorAll("tr[data-o]").forEach(tr=>tr.onclick=()=>{$("f-obra").value=tr.dataset.o;render();});
}

function renderLista(L){
  $("n-rdos").textContent="("+L.length+")";
  $("t-rdos").innerHTML=L.length?L.map((r,i)=>`<tr data-i="${i}"><td>${fmt(r.data)}</td><td>${esc(obraNome(r))}</td><td class="n">${esc(r.rdo)}</td><td>${esc(r.resp)}</td><td class="n">${r.total}</td><td>${esc(semIcone(r.clima_manha)||"-")} / ${esc(semIcone(r.clima_tarde)||"-")}</td><td class="n">${num(r.n_fotos)}</td><td>${String(r.ocor||"").trim()?'<span class="pill alert">Sim</span>':"-"}</td></tr>`).join(""):'<tr><td colspan="8" class="status">Nenhum RDO no período.</td></tr>';
  $("t-rdos").querySelectorAll("tr[data-i]").forEach(tr=>tr.onclick=()=>abrir(L[+tr.dataset.i]));
}

/* ---------- detalhe ---------- */
function abrir(r){
  let fotos=[];try{fotos=JSON.parse(r.fotos||"[]");}catch(e){}
  const campo=(t,v)=>`<div><span>${t}</span>${esc(v||"-")}</div>`;
  const bloco=(t,v)=>v&&String(v).trim()?`<div><div class="det"><div><span>${t}</span></div></div><div class="txt">${esc(v)}</div></div>`:"";
  $("modal-box").innerHTML=`
    <div class="topo"><h3>RDO ${esc(r.rdo)} · ${esc(obraNome(r))}</h3><button type="button" class="btn sec" id="m-fechar">Fechar</button></div>
    <div class="det">
      ${campo("ID",r.idobra)}${campo("Obra",r.obra)}${campo("Local",r.local)}${campo("Data",fmt(r.data))}
      ${campo("Responsável",r.resp)}${campo("Expediente",(r.hini||"?")+" às "+(r.hfim||"?"))}
      ${campo("Tempo manhã",semIcone(r.clima_manha))}${campo("Tempo tarde",semIcone(r.clima_tarde))}
      ${campo("Efetivo",r.total+" pessoas ("+FUNCOES.map(([k,n])=>n+" "+num(r[k])).join(", ")+")")}
    </div>
    ${bloco("Atividades executadas",r.ativ)}${bloco("Equipamentos",r.equip)}${bloco("Materiais recebidos",r.mat)}
    ${bloco("Ocorrências",r.ocor)}${bloco("Observações",r.obs)}
    ${fotos.length?`<div class="det"><div><span>Fotos (${fotos.length})</span></div></div><div class="galeria">${fotos.map((f,i)=>`<figure><div class="ph" data-id="${esc(f.id)}">Carregando…</div><figcaption><b>Foto ${i+1}:</b> ${esc(f.desc||"sem legenda")}</figcaption></figure>`).join("")}</div>`:""}
    <div class="topo">${r.pdf?`<button type="button" class="btn pri" id="m-pdf">⬇ Baixar PDF do RDO</button>`:`<span class="status">O PDF deste RDO ainda não chegou à central.</span>`}
    ${r.pasta_fotos?`<a href="${esc(r.pasta_fotos)}" target="_blank" rel="noopener" class="status">Abrir pasta da obra no Google Drive</a>`:""}</div>
    <div class="msg" id="m-msg" role="status"></div>`;
  $("modal").hidden=false;
  $("m-fechar").onclick=fechar;
  if(r.pdf)$("m-pdf").onclick=async()=>{
    const b=$("m-pdf");b.disabled=true;msg("m-msg","Baixando o PDF…");
    try{
      const j=await chamar({acao:"foto",id:r.pdf});
      const bytes=Uint8Array.from(atob(j.b64),c=>c.charCodeAt(0));
      const u=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
      const a=document.createElement("a");a.href=u;a.download="RDO_"+(r.rdo||"")+"_"+(r.idobra||"")+"_"+(r.data||"")+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
      msg("m-msg","PDF baixado.");
    }catch(e){msg("m-msg","Não consegui baixar o PDF: "+e.message,true);}
    finally{b.disabled=false;}
  };
  $("modal-box").querySelectorAll(".ph[data-id]").forEach(async ph=>{
    try{const j=await chamar({acao:"foto",id:ph.dataset.id});ph.innerHTML=`<img alt="" src="data:${j.tipo||"image/jpeg"};base64,${j.b64}">`;}
    catch(e){ph.textContent="Foto indisponível";}
  });
}
function fechar(){$("modal").hidden=true;$("modal-box").innerHTML="";}
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))fechar();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("modal").hidden)fechar();});

/* ---------- Excel ---------- */
function carregarXlsx(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement("script");s.src="lib/xlsx.full.min.js";s.onload=ok;s.onerror=()=>no(new Error("gerador de planilha não carregou"));document.head.appendChild(s);});
}
$("b-excel").onclick=async()=>{
  const L=filtrados().slice().reverse();
  if(!L.length){msg("msg","Nenhum RDO para exportar.",true);return;}
  try{
    await carregarXlsx();
    const rows=L.map(r=>({"Data":fmt(r.data),"ID":(canon[obraChave(r)]||r).idobra,"Obra":(canon[obraChave(r)]||r).obra,"Local":(canon[obraChave(r)]||r).local,"Obra como digitada":[r.obra,r.local].filter(Boolean).join(" / "),"Nº RDO":num(r.rdo)||r.rdo,"Responsável":r.resp,"Início":r.hini,"Fim":r.hfim,
      "Tempo manhã":semIcone(r.clima_manha),"Tempo tarde":semIcone(r.clima_tarde),"Líder":num(r.lider),"Montador":num(r.montador),"Auxiliar":num(r.auxiliar),"Outros":num(r.outros),"Total efetivo":r.total,
      "Atividades executadas":r.ativ,"Equipamentos":r.equip,"Materiais recebidos":r.mat,"Ocorrências":r.ocor,"Observações":r.obs,"Nº de fotos":num(r.n_fotos),"PDF na central":r.pdf?"Sim":"Não","Pasta da obra":r.pasta_fotos}));
    const ws=XLSX.utils.json_to_sheet(rows);
    ws["!cols"]=Object.keys(rows[0]).map(k=>({wch:/Atividades|Ocorr|Equip|Materiais|Observ|Pasta/.test(k)?45:k==="Obra"?24:12}));
    ws["!autofilter"]={ref:ws["!ref"]};
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"RDOs");
    const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    const u=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a=document.createElement("a");a.href=u;a.download="RDOs_"+($("f-de").value||"")+"_a_"+($("f-ate").value||"")+".xlsx";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
    msg("msg","Planilha baixada.");
  }catch(e){msg("msg","Não consegui gerar a planilha: "+e.message,true);}
};

/* ---------- início ---------- */
if(!CENTRAL.url){msg("msg-login","A central ainda não foi configurada.",true);}
try{const s=sessionStorage.getItem("sup-senha");if(s){$("senha").value=s;entrar();}}catch(e){}
})();
