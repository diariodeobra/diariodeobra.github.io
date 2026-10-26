(function(){
"use strict";
const VERSAO="23/10/2026 16:20";
const $=id=>document.getElementById(id);
const CLIMAS=["☀️ Bom","⛅ Nublado","🌧️ Chuva","⛈️ Impraticável"];
const MO=[["m_lid","Líder"],["m_mon","Montador"],["m_aux","Auxiliar"],["m_out","Outros"]];
const FIELDS=["idobra","obra","local","data","rdo","resp","hini","hfim","ativ","equip","mat","ocor","obs",...MO.map(m=>m[0])];
const clima={manha:"",tarde:""};
let registros=[], editId=null, fotos=[], envio=null;

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
async function carregar(){try{registros=await dbAll()||[];}catch(e){registros=[];}render();}

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
function obraNome(r){return [r.idobra,r.obra].filter(Boolean).join(" - ")+(r.local?" / "+r.local:"");}
function obraChave(r){return ((r.idobra||"")+"|"+(r.obra||"")).toLowerCase().trim();}
function proxRdo(ref){const k=obraChave(ref);const n=registros.filter(r=>obraChave(r)===k&&r._id!==editId).map(r=>parseInt(r.rdo)||0);return n.length?Math.max(...n)+1:1;}
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
  return r;
}
function preencher(r){
  FIELDS.forEach(f=>$(f).value=r[f]||"");
  if(!$("hini").value)$("hini").value="07:00";if(!$("hfim").value)$("hfim").value="17:00";
  clima.manha=r.clima_manha||"";clima.tarde=r.clima_tarde||"";
  fotos=(r.fotos||[]).filter(f=>f&&f.blob).map(f=>({blob:f.blob,desc:f.desc||"",url:URL.createObjectURL(f.blob)}));
  paintClima();renderFotos();
}
let tSalvar=null;
function update(){
  $("mtot").textContent=total(lerForm());
  clearTimeout(tSalvar);tSalvar=setTimeout(()=>{draftPut({...lerForm(),editId}).catch(()=>{});},400);
}
function validar(){
  const falta=[];
  if(!$("obra").value.trim())falta.push("obra");
  if(!$("data").value)falta.push("data");
  if(!$("resp").value.trim())falta.push("responsável");
  if(!$("ativ").value.trim())falta.push("atividades executadas");
  if(falta.length){msg("Preencha: "+falta.join(", ")+".",true);return false;}
  return true;
}
function limpar(){
  FIELDS.forEach(f=>{if(!["resp","idobra","obra","local","hini","hfim"].includes(f))$(f).value="";});
  $("data").value=hoje();clima.manha="";clima.tarde="";editId=null;fotos=[];renderFotos();paintClima();update();
}
$("f").addEventListener("input",update);
$("idobra").addEventListener("change",()=>{
  const id=$("idobra").value.trim();if(!id)return;
  const ult=registros.filter(r=>(r.idobra||"")===id).sort((a,b)=>(b.salvoEm||"").localeCompare(a.salvoEm||""))[0];
  if(ult){if(!$("obra").value.trim())$("obra").value=ult.obra||"";if(!$("local").value.trim())$("local").value=ult.local||"";update();}
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

/* ---------- salvar ---------- */
async function salvar(){
  const r=lerForm();
  if(!r.rdo){r.rdo=String(proxRdo(r));$("rdo").value=r.rdo;}
  const id=editId||("rdo-"+Date.now());
  const reg={...r,_id:id,salvoEm:new Date().toISOString()};
  await dbPut(reg);
  await carregar();
  return reg;
}

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
    espaco(22,r);y+=10;
    doc.setDrawColor(...CZ);doc.setLineWidth(.3);doc.line(M,y,M+75,y);doc.line(W-M-75,y,W-M,y);
    doc.setFontSize(8);doc.setTextColor(...CZ);doc.text("Responsável pela obra",M,y+4);doc.text("Fiscalização",W-M-75,y+4);
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
  const ass=txt=>new D.TableCell({borders:bordas0,children:[p(t(""),{before:500,after:0,border:{bottom:{color:CZ,space:1,style:D.BorderStyle.SINGLE,size:6}}}),p(t(txt,{color:CZ,size:16}))]});
  corpo.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},borders:bordas0,rows:[new D.TableRow({cantSplit:true,children:[ass("Responsável pela obra"),new D.TableCell({borders:bordas0,children:[p(t(""))]}),ass("Fiscalização")]})]}));
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
  catch(e){msg("Não consegui salvar ("+(e&&e.message||e)+").",true);}
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
  }catch(e){msg("Não consegui gerar o "+F.rotulo+" ("+(e&&e.message||e)+").",true);}
  finally{btn.disabled=false;btn.innerHTML=lbl;}
}
$("b-wa").onclick=()=>salvarEEnviar($("b-wa"),"pdf");
$("b-word").onclick=()=>salvarEEnviar($("b-word"),"docx");
$("b-save").onclick=async()=>{
  if(!validar())return;
  try{const r=await salvar();limpar();msg("RDO "+r.rdo+" salvo neste celular.");}
  catch(e){msg("Não consegui salvar ("+(e&&e.message||e)+").",true);}
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
  return registros.filter(r=>!o||obraNome(r)===o).sort((a,b)=>{const d=(a.data||"").localeCompare(b.data||"")||(parseInt(a.rdo)||0)-(parseInt(b.rdo)||0);return asc?d:-d;});
}
let thumbUrls=[];
function render(){
  const uniq=k=>[...new Set(registros.map(r=>r[k]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"pt"));
  $("ids").innerHTML=uniq("idobra").map(o=>`<option value="${esc(o)}">`).join("");
  $("obras").innerHTML=uniq("obra").map(o=>`<option value="${esc(o)}">`).join("");
  $("locais").innerHTML=uniq("local").map(o=>`<option value="${esc(o)}">`).join("");
  const obras=[...new Set(registros.map(obraNome).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt"));
  const sel=$("fobra"),cur=sel.value;
  sel.innerHTML='<option value="">Todas as obras</option>'+obras.map(o=>`<option${o===cur?" selected":""}>${esc(o)}</option>`).join("");
  $("hist-n").textContent=registros.length?"("+registros.length+")":"";
  thumbUrls.forEach(u=>URL.revokeObjectURL(u));thumbUrls=[];
  const lst=filtrados(false);
  if(!lst.length){$("lista").innerHTML='<div class="empty">Nenhum RDO salvo neste celular ainda. Preencha a aba <b>Novo registro</b>; os diários aparecem aqui, do mais recente para o mais antigo.</div>';return;}
  $("lista").innerHTML=lst.map(r=>{
    const fs=(r.fotos||[]).filter(f=>f&&f.blob);
    const th=fs.map((f,i)=>{const u=URL.createObjectURL(f.blob);thumbUrls.push(u);return `<figure><img src="${u}" alt="Foto ${i+1}" loading="lazy"><figcaption>${esc(f.desc||"Foto "+(i+1))}</figcaption></figure>`;}).join("");
    return `<article class="entry">
      <div class="top"><h3>${esc(obraNome(r))}</h3><span class="rdo">RDO ${esc(r.rdo||"-")}</span></div>
      <div class="meta">${esc(fmtData(r.data))} · ${esc(r.resp)} · <span class="num">${total(r)}</span> pessoas</div>
      ${r.ocor?'<div><span class="pill alert">Ocorrência</span></div>':""}
      <div class="body">${esc((r.ativ||"").split("\n")[0])}${(r.ativ||"").includes("\n")?" …":""}</div>
      ${th?`<div class="thumbs">${th}</div>`:""}
      <div class="tools">
        <button class="btn wa" data-a="wa" data-f="pdf" data-id="${esc(r._id)}">Enviar PDF</button>
        <button class="btn wa" data-a="wa" data-f="docx" data-id="${esc(r._id)}">Enviar Word</button>
        <button class="btn sec" data-a="ed" data-id="${esc(r._id)}">Editar</button>
        <button class="btn sec" data-a="del" data-id="${esc(r._id)}">Excluir</button>
      </div>
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
  if(b.dataset.a==="ed"){preencher(r);editId=r._id;update();tab(false);window.scrollTo(0,0);msg("Editando o RDO "+(r.rdo||"")+". Salve para gravar as mudanças.");}
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
  await carregar();
})();
})();
