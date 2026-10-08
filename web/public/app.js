// 乐评大屏前端：拉取 /api/* 结果 JSON，用 ECharts 渲染 5 视图 + 顶部 KPI
const app = document.getElementById('app');
const charts = [];
const AX = { axisLine:{lineStyle:{color:'#3a4368'}}, axisLabel:{color:'#aeb6d0'},
             splitLine:{lineStyle:{color:'#1e2540'}} };

async function api(name){ try{ const r=await fetch('/api/'+name); if(!r.ok) return null; return await r.json(); }catch(e){ return null; } }
function mkChart(id){ const el=document.getElementById(id); if(!el) return null; const c=echarts.init(el,'dark'); c.setOption({backgroundColor:'transparent'}); charts.push(c); return c; }
function emptyMsg(id,m){ const el=document.getElementById(id); if(el) el.innerHTML='<div class="empty">'+(m||'暂无数据，请先运行对应 Spark 作业')+'</div>'; }
function esc(s){ return String(s==null?'':s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function fmt(n){ n=+n||0; return n>=1e8?(n/1e8).toFixed(1)+'亿':n>=1e4?(n/1e4).toFixed(1)+'万':n; }

// ---------- KPI ----------
async function loadKPI(){
  const kpi=await api('kpi'), sd=await api('sentiment_dist');
  let posRate='—';
  if(sd&&sd.length){ const t=sd.reduce((a,b)=>a+b.count,0); const p=(sd.find(x=>x.sentiment==='正向')||{}).count||0; posRate=t?Math.round(p/t*100)+'%':'—'; }
  const box=document.getElementById('kpi'); if(!box) return;
  const items=[ ['歌曲', kpi?fmt(kpi.songs):'—'], ['真实评论总数', kpi?fmt(kpi.real_comments):'—'],
    ['歌手', kpi?fmt(kpi.artists):'—'], ['采样评论', kpi?fmt(kpi.sample_comments):'—'], ['情感正向率', posRate] ];
  box.innerHTML=items.map(([l,v])=>`<div class="kpi"><div class="num">${v}</div><div class="lab">${l}</div></div>`).join('');
}

// ---------- 视图切换 ----------
const ANALYSIS_VIEWS = { rank:renderRank, sentiment:renderSentiment, topic:renderTopic, mood:renderMood, artist:renderArtist, imagery:renderImagery, era:renderEra };
function loadView(v){
  charts.forEach(c=>c.dispose()); charts.length=0;
  app.innerHTML=''; app.appendChild(document.getElementById('view-'+v).content.cloneNode(true));
  if(ANALYSIS_VIEWS[v]) ANALYSIS_VIEWS[v]();
  else if(window.DB && window.DB[v]) window.DB[v]();   // 数据库模块（db.js）
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); loadView(t.dataset.view);
}));
window.addEventListener('resize',()=>charts.forEach(c=>c.resize()));

// ============== ① 热度榜单 ==============
async function renderRank(){
  const c=mkChart('c_rank');
  async function draw(key,vkey,unit){
    const data=await api(key); if(!data||!data.length) return emptyMsg('c_rank');
    const top=data.slice(0,15).reverse();
    c.setOption({ grid:{left:160,right:60,top:10,bottom:20}, tooltip:{trigger:'axis'},
      xAxis:{type:'value',...AX}, yAxis:{type:'category',data:top.map(d=>d.name+' - '+d.artist_name),...AX},
      series:[{type:'bar',data:top.map(d=>d[vkey]),
        itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'#7a0b3a'},{offset:1,color:'#e0143c'}]),borderRadius:[0,4,4,0]},
        label:{show:true,position:'right',color:'#ffb347',formatter:p=>fmt(p.value)}}] });
  }
  draw('rank_comment','comment_total','评论数');
  document.querySelectorAll('.rsw').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.rsw').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    draw(b.dataset.k,b.dataset.v,b.dataset.u); }));

  const dur=await api('feat_duration');
  if(dur&&dur.length) mkChart('c_dur').setOption({tooltip:{trigger:'item'},
    series:[{type:'pie',radius:['42%','70%'],data:dur.map(d=>({name:d.dur_bucket,value:d.count})),label:{color:'#e9ecf5'}}]});
  else emptyMsg('c_dur');

  const ah=await api('feat_artist_hot');
  if(ah&&ah.length){ const top=ah.slice(0,12).reverse();
    mkChart('c_arthot').setOption({grid:{left:110,right:40,top:10,bottom:20},tooltip:{trigger:'axis'},
      xAxis:{type:'value',...AX},yAxis:{type:'category',data:top.map(d=>d.artist_name),...AX},
      series:[{type:'bar',data:top.map(d=>d.heat),itemStyle:{color:'#ff7aa2',borderRadius:[0,4,4,0]}}]}); }
  else emptyMsg('c_arthot');

  const yr=await api('feat_year');
  if(yr&&yr.length) mkChart('c_year').setOption({tooltip:{trigger:'axis'},
    legend:{data:['发行量','平均评论'],textStyle:{color:'#aeb6d0'}},
    xAxis:{type:'category',data:yr.map(d=>d.year),...AX},
    yAxis:[{type:'value',name:'发行量',...AX},{type:'value',name:'平均评论',...AX}],
    series:[{name:'发行量',type:'bar',data:yr.map(d=>d.cnt),itemStyle:{color:'#5b8ff9',borderRadius:[4,4,0,0]}},
      {name:'平均评论',type:'line',yAxisIndex:1,smooth:true,data:yr.map(d=>d.avg_comment),itemStyle:{color:'#ffb347'}}]});
  else emptyMsg('c_year');
}

// ============== ② 情感分析 ==============
async function renderSentiment(){
  const dist=await api('sentiment_dist');
  if(dist&&dist.length){ const col={'正向':'#22c55e','中性':'#9aa3bf','负向':'#ef4444'};
    mkChart('c_sentdist').setOption({tooltip:{trigger:'item',formatter:'{b}: {c} ({d}%)'},
      series:[{type:'pie',radius:['40%','70%'],data:dist.map(d=>({name:d.sentiment,value:d.count,itemStyle:{color:col[d.sentiment]||'#888'}})),label:{color:'#e9ecf5'}}]}); }
  else emptyMsg('c_sentdist');

  const contro=await api('controversy');
  if(contro&&contro.length){ const top=contro.slice(0,12).reverse();
    mkChart('c_contro').setOption({grid:{left:140,right:40,top:10,bottom:20},
      tooltip:{trigger:'axis',formatter:p=>{const d=top[p[0].dataIndex];return `${esc(d.name||d.song_id)}<br/>争议指数 ${d.controversy}<br/>正 ${d.pos} / 负 ${d.neg} / 方差 ${d.sent_var}`;}},
      xAxis:{type:'value',name:'争议指数',...AX},yAxis:{type:'category',data:top.map(d=>d.name||d.song_id),...AX},
      series:[{type:'bar',data:top.map(d=>d.controversy),itemStyle:{color:'#a855f7',borderRadius:[0,4,4,0]}}]}); }
  else emptyMsg('c_contro');

  // 情绪榜切换
  const eg=mkChart('c_emorank');
  async function drawEmo(key,vkey){ const data=await api(key); if(!data||!data.length) return emptyMsg('c_emorank');
    const top=data.slice(0,12).reverse();
    eg.setOption({grid:{left:140,right:40,top:10,bottom:20},tooltip:{trigger:'axis'},
      xAxis:{type:'value',...AX},yAxis:{type:'category',data:top.map(d=>d.name||d.song_id),...AX},
      series:[{type:'bar',data:top.map(d=>d[vkey]||d.cnt||d.tear_sum),itemStyle:{color:'#38bdf8',borderRadius:[0,4,4,0]}}]}); }
  drawEmo('tearjerker','tear_sum');
  bindSwitch('#c_emorank', (b)=>drawEmo(b.dataset.k,b.dataset.v), 'c_emorank');

  // 评论列表切换（高赞金句 / 催泪故事）
  async function drawCmt(key){ const data=await api(key); const box=document.getElementById('cmt_list');
    if(!data||!data.length) return emptyMsg('cmt_list');
    box.innerHTML=data.map(d=>`<div class="list-item"><div class="li-main">
      <div class="li-title">${esc(d.content)}</div>
      <div class="li-sub">《${esc(d.name||'?')}》— ${esc(d.artist_name||'?')}${d.sentiment?' · '+d.sentiment:''}</div></div>
      <div class="li-meta">${d.tear!=null?'😢'+d.tear+' ':''}👍${fmt(d.liked)}</div></div>`).join(''); }
  drawCmt('top_comments');
  bindSwitch('#cmt_list', (b)=>drawCmt(b.dataset.k), 'cmt_list');
}
// 通用：为某容器上方最近的 .rank-switch 绑定切换
function bindSwitch(sel, fn){
  const cont=document.querySelector(sel); const sw=cont.parentElement.querySelector('.rank-switch');
  if(!sw) return; sw.querySelectorAll('.rsw').forEach(b=>b.addEventListener('click',()=>{
    sw.querySelectorAll('.rsw').forEach(x=>x.classList.remove('active')); b.classList.add('active'); fn(b); }));
}

// ============== ③ 主题挖掘 ==============
async function renderTopic(){
  const tw=await api('topic_words'); const box=document.getElementById('topic_cards');
  if(tw&&tw.length) box.innerHTML=tw.map(t=>`<div class="tcard">
    <span class="tcnt">主题${t.topic}</span><div class="tname">${esc(t.name||'综合')}</div>
    <div class="twords">${(t.words||[]).slice(0,10).map(w=>`<span class="tag theme">${esc(w)}</span>`).join('')}</div>
    <div class="texs">代表：${(t.examples||[]).map(e=>esc(e.name)).join(' / ')||'—'}</div></div>`).join('');
  else emptyMsg('topic_cards');

  const td=await api('topic_distribution');
  if(td&&td.length) mkChart('c_topicdist').setOption({tooltip:{trigger:'item'},
    series:[{type:'pie',roseType:'radius',radius:['25%','70%'],
      data:td.map(d=>({name:d.name||('主题'+d.main_topic),value:d.count})),label:{color:'#e9ecf5',fontSize:11}}]});
  else emptyMsg('c_topicdist');

  const river=await api('topic_river');
  if(river&&river.length){ const nameMap={}; (td||[]).forEach(d=>nameMap[d.main_topic]=d.name);
    const topics=[...new Set(river.map(d=>d.main_topic))].sort((a,b)=>a-b);
    const years=[...new Set(river.map(d=>d.year))].sort((a,b)=>a-b);
    mkChart('c_river').setOption({tooltip:{trigger:'axis'},
      legend:{data:topics.map(t=>nameMap[t]||('主题'+t)),textStyle:{color:'#aeb6d0'},type:'scroll'},
      xAxis:{type:'category',data:years,boundaryGap:false,...AX},yAxis:{type:'value',...AX},
      series:topics.map(tp=>({name:nameMap[tp]||('主题'+tp),type:'line',stack:'t',areaStyle:{},smooth:true,
        data:years.map(y=>{const r=river.find(x=>x.year===y&&x.main_topic===tp);return r?r.count:0;})}))});
  } else emptyMsg('c_river');

  drawWC('c_wc','wordcloud'); drawWC('c_wcl','wordcloud_lyric');
}
async function drawWC(id,name){ const wc=await api(name); if(!wc||!wc.length) return emptyMsg(id);
  mkChart(id).setOption({tooltip:{},series:[{type:'wordCloud',shape:'circle',sizeRange:[12,58],rotationRange:[-40,40],gridSize:6,
    textStyle:{color:()=>'rgb('+[220,80+(Math.random()*150|0),120+(Math.random()*100|0)].join(',')+')'},
    data:wc.map(d=>({name:d.w,value:d.count}))}]}); }

// ============== ④ 情绪点歌 ==============
async function renderMood(){
  const mp=await api('mood_playlist'); const btns=document.getElementById('mood_btns'); const list=document.getElementById('mood_list');
  if(mp&&Object.keys(mp).length){ const moods=Object.keys(mp); const emo={'治愈':'🌿','emo':'🌧️','励志':'🔥','甜蜜':'💗','怀旧':'📼'};
    btns.innerHTML=moods.map((m,i)=>`<button class="moodb ${i?'':'active'}" data-m="${m}">${emo[m]||'🎵'} ${m}</button>`).join('');
    const show=m=>{ const s=mp[m]||[]; list.innerHTML=s.length?s.map((x,i)=>`<div class="list-item"><div class="li-main">
      <div class="li-title">${i+1}. ${esc(x.name)}</div><div class="li-sub">${esc(x.artist_name)}</div></div>
      <div class="li-meta">💬${fmt(x.comment_count)}</div></div>`).join(''):'<div class="empty">该情绪暂无歌曲</div>'; };
    btns.querySelectorAll('.moodb').forEach(b=>b.addEventListener('click',()=>{
      btns.querySelectorAll('.moodb').forEach(x=>x.classList.remove('active')); b.classList.add('active'); show(b.dataset.m); }));
    show(moods[0]);
  } else emptyMsg('mood_list');

  // 交互式相似推荐
  const rec=await api('recommend'); const sel=document.getElementById('rec_sel'); const res=document.getElementById('rec_result');
  if(rec&&Object.keys(rec).length){ const entries=Object.entries(rec);
    sel.innerHTML=entries.map(([id,r])=>`<option value="${id}">${esc(r.name)} - ${esc(r.artist)}</option>`).join('');
    const show=id=>{ const r=rec[id]; if(!r) return;
      res.innerHTML=`<div class="rec-from">为 <b>《${esc(r.name)}》- ${esc(r.artist)}</b>（主题：${esc(r.topic||'—')}）推荐主题最接近的歌：</div>`+
        (r.similar||[]).map(s=>`<div class="list-item"><div class="li-main">
          <div class="li-title">${esc(s.name)} <span class="li-sub">${esc(s.artist)}</span></div>
          <div class="li-sub">共同主题：${esc(s.topic||'—')}</div></div>
          <div class="li-meta">相似度 ${s.score}</div></div>`).join(''); };
    sel.addEventListener('change',()=>show(sel.value)); show(entries[0][0]);
  } else emptyMsg('rec_result');
}

// ============== ⑤ 歌手画像 ==============
async function renderArtist(){
  const ap=await api('artist_profile');
  if(!ap||!ap.length){ emptyMsg('c_influence');emptyMsg('c_radar');emptyMsg('artist_tbl');return; }
  const top=ap.slice(0,12).reverse();
  mkChart('c_influence').setOption({grid:{left:110,right:40,top:10,bottom:20},tooltip:{trigger:'axis'},
    xAxis:{type:'value',...AX},yAxis:{type:'category',data:top.map(d=>d.artist_name),...AX},
    series:[{type:'bar',data:top.map(d=>d.influence),itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'#7a0b3a'},{offset:1,color:'#ff7aa2'}]),borderRadius:[0,4,4,0]}}]});

  const sel=document.getElementById('artist_sel'); sel.innerHTML=ap.map((d,i)=>`<option value="${i}">${esc(d.artist_name)}</option>`).join('');
  const radar=mkChart('c_radar');
  const draw=i=>{ const a=ap[i]; const ind=[
    {name:'作品数',max:Math.max(...ap.map(x=>x.song_num||1))},{name:'评论',max:Math.max(...ap.map(x=>x.comments||1))},
    {name:'点赞',max:Math.max(...ap.map(x=>x.likes||1))},{name:'热度',max:100},{name:'影响力',max:Math.max(...ap.map(x=>x.influence||1))}];
    radar.setOption({tooltip:{},radar:{indicator:ind,axisName:{color:'#aeb6d0'},splitLine:{lineStyle:{color:'#2a3354'}},splitArea:{show:false}},
      series:[{type:'radar',areaStyle:{opacity:.3},itemStyle:{color:'#e0143c'},data:[{value:[a.song_num,a.comments,a.likes,a.avg_pop,a.influence],name:a.artist_name}]}]}); };
  sel.addEventListener('change',()=>draw(+sel.value)); draw(0);

  document.getElementById('artist_tbl').innerHTML=`<table><tr><th>歌手</th><th>作品</th><th>真实总评论</th><th>点赞</th><th>影响力</th><th>词风关键词</th></tr>
    ${ap.slice(0,20).map(d=>`<tr><td>${esc(d.artist_name)}</td><td>${d.song_num}</td><td>${fmt(d.comments)}</td><td>${fmt(d.likes)}</td><td>${d.influence}</td>
      <td>${(d.style_words||'').split(',').slice(0,8).map(w=>`<span class="tag">${esc(w)}</span>`).join('')}</td></tr>`).join('')}</table>`;
}

// ============== 🕸️ 歌手合作网络（创新） ==============
const COMM_COLORS = ['#e0143c','#5b8ff9','#22c55e','#ffb347','#a855f7','#38bdf8','#ff7aa2','#f59e0b','#14b8a6','#9aa3bf'];
let _netCache = null;
window.__getNetCache = async function(){  // 导出供 db.js 歌手详情页内嵌网络使用
  if(_netCache) return _netCache;
  const nodes = await api('graph_nodes'), edges = await api('graph_edges');
  _netCache = { nodes, edges };
  return _netCache;
};
async function renderNetwork(){
  const c = mkChart('c_network');
  if(!_netCache){
    const nodes = await api('graph_nodes'), edges = await api('graph_edges');
    if(!nodes||!nodes.length){ emptyMsg('c_network','暂无合作网络数据，请先运行 spark/submit.sh graph.py'); return; }
    _netCache = { nodes, edges };
    window.__netCache = _netCache;
    // 社群下拉
    const comms = [...new Set(nodes.map(n=>n.community).filter(x=>x>=0))].sort((a,b)=>a-b);
    const sel = document.getElementById('ng_comm');
    if(sel) sel.innerHTML = '<option value="">全部社群</option>'+comms.map(c=>`<option value="${c}">社群 ${c+1}</option>`).join('');
  }
  // _hl：当前高亮节点名（点击切换）。focus：搜索框文本。两者任一非空即进入「聚焦模式」。
  let _hl = null;
  function buildFocus(){
    const minW = +(document.getElementById('ng_minw')||{}).value || 1;
    const commF = (document.getElementById('ng_comm')||{}).value;
    const focus = ((document.getElementById('ng_focus')||{}).value||'').trim();
    let edges = _netCache.edges.filter(e=>e.weight>=minW);
    const used = new Set(); edges.forEach(e=>{used.add(e.source);used.add(e.target);});
    let nodes = _netCache.nodes.filter(n=>used.has(n.name));
    if(commF!==''){ const cf=+commF; nodes=nodes.filter(n=>n.community===cf);
      const keep=new Set(nodes.map(n=>n.name)); edges=edges.filter(e=>keep.has(e.source)&&keep.has(e.target)); }
    return { nodes, edges, focus };
  }
  // 计算高亮集合：focus（搜索框）或 _hl（点击的节点）激活时，仅匹配节点+其邻居高亮，其余变暗。
  function computeHi(nodes, edges, focus){
    const hasFocus = !!(focus || _hl);
    if(!hasFocus) return null;
    const match = new Set();
    nodes.forEach(n=>{
      if((focus && n.name.includes(focus)) || (_hl && n.name===_hl)) match.add(n.name);
    });
    const hi = new Set(match);
    edges.forEach(e=>{
      if(match.has(e.source)) hi.add(e.target);
      if(match.has(e.target)) hi.add(e.source);
    });
    return hi;
  }
  function draw(){
    const { nodes, edges, focus } = buildFocus();
    const maxPR = Math.max(...nodes.map(n=>n.pagerank),0.01);
    const hi = computeHi(nodes, edges, focus);
    const gnodes = nodes.map(n=>{
      const isHi = !hi || hi.has(n.name);
      const isMatch = (focus && n.name.includes(focus)) || (_hl && n.name===_hl);
      return { id:n.name, name:n.name, symbolSize: 8+Math.sqrt(n.pagerank/maxPR)*46,
        value:n.pagerank, category:n.community<0?COMM_COLORS.length-1:n.community,
        itemStyle: isMatch ? {borderColor:'#fff',borderWidth:3,shadowBlur:20,shadowColor:'#fff'} : undefined,
        label:{ show: isHi && (isMatch || n.pagerank>maxPR*0.45) },
        lineStyle: hi ? { opacity: isHi?0.9:0.04 } : undefined,
        opacity: hi ? (isHi?1:0.12) : 1 };
    });
    const gedges = edges.map(e=>{
      const isHi = !hi || (hi.has(e.source)&&hi.has(e.target));
      return { source:e.source, target:e.target, weight:e.weight,
        lineStyle:{ width:Math.min(0.4+e.weight*0.5,6), opacity: hi ? (isHi?0.85:0.04) : 0.45 } };
    });
    const cats = COMM_COLORS.map((col,i)=>({name:i===COMM_COLORS.length-1?'其他':('社群'+(i+1)),itemStyle:{color:col}}));
    c.setOption({
      tooltip:{ formatter:p=> p.dataType==='edge'
        ? `${p.data.source} — ${p.data.target}<br/>合作 ${p.data.weight} 次`
        : `<b>${p.data.name}</b><br/>影响力(PR) ${(+p.value).toFixed(3)}` },
      legend:[{ data:cats.map(c=>c.name), textStyle:{color:'#aeb6d0'}, top:6, type:'scroll' }],
      series:[{ type:'graph', layout:'force', roam:true, draggable:true, categories:cats,
        data:gnodes, edges:gedges,
        force:{ repulsion: 320, edgeLength:[80,220], gravity:0.04, friction:0.16 },
        lineStyle:{ color:'source', curveness:0.12 },
        emphasis:{ focus:'adjacency', lineStyle:{width:4} },
        label:{ color:'#e9ecf5', fontSize:11, position:'right' },
        scaleLimit:{min:0.4,max:4} }]
    }, true);
    c.off('click'); c.off('dblclick');
    // 单击：切换高亮（再次点击同名节点取消）
    c.on('click', p=>{ if(p.dataType==='node'){
      _hl = (_hl===p.data.name) ? null : p.data.name;
      draw();
    }});
    // 双击：跳转歌手画像
    c.on('dblclick', p=>{ if(p.dataType==='node' && window.__showArtist) window.__showArtist(p.data.name); });
    const lg=document.getElementById('ng_legend');
    if(lg) lg.innerHTML = `<span class="ng-stat">节点 <b>${nodes.length}</b></span><span class="ng-stat">合作边 <b>${edges.length}</b></span><span class="ng-stat">💡 单击节点高亮（含合作者），双击查看歌手画像；输入歌手名搜索可仅高亮该歌手</span>`;
  }
  draw();
  ['ng_go'].forEach(id=>{const b=document.getElementById(id); if(b) b.onclick=()=>{ _hl=null; draw(); };});
  const fi=document.getElementById('ng_focus'); if(fi) fi.onkeydown=e=>{ if(e.key==='Enter'){ _hl=null; draw(); } };
}

// ============== 🗺️ 歌词意象地图（创新） ==============
async function renderImagery(){
  const data = await api('imagery_map');
  const c = mkChart('c_imagery');
  if(!data||!data.length){ emptyMsg('c_imagery','暂无意象数据，请先运行 spark/submit.sh imagery.py'); return; }
  const maxC = Math.max(...data.map(d=>d.song_cnt));
  // 用经纬度做笛卡尔散点（离线，无需 geojson）；底图为简化经纬网格
  c.setOption({
    backgroundColor:'transparent',
    tooltip:{ formatter:p=>{ const d=p.data.raw; return `<b>${d.name}</b><br/>出现 ${d.song_cnt} 首 · 热度 ${fmt(d.heat)}<br/>代表：${(d.songs||[]).slice(0,3).map(s=>s.name).join(' / ')||'—'}`; } },
    grid:{ left:40, right:30, top:30, bottom:40 },
    xAxis:{ name:'经度', min:-160, max:160, ...AX, splitLine:{lineStyle:{color:'#161d33'}} },
    yAxis:{ name:'纬度', min:-10, max:60, ...AX, splitLine:{lineStyle:{color:'#161d33'}} },
    visualMap:{ min:0, max:maxC, dimension:2, inRange:{color:['#5b8ff9','#ffb347','#e0143c'],symbolSize:[10,60]},
      textStyle:{color:'#aeb6d0'}, left:10, bottom:10, text:['多','少'] },
    series:[{ type:'scatter', symbolSize:v=>8+Math.sqrt(v[2]/maxC)*52,
      data:data.map(d=>({ value:[d.lng,d.lat,d.song_cnt], raw:d, name:d.name })),
      label:{ show:true, formatter:p=>p.data.raw.song_cnt>maxC*0.12?p.data.name:'', color:'#e9ecf5', fontSize:11, position:'top' },
      itemStyle:{ opacity:0.85, shadowBlur:10, shadowColor:'rgba(224,20,60,.4)' },
      emphasis:{ label:{show:true}, itemStyle:{borderColor:'#fff',borderWidth:2} } }]
  });
  c.off('click'); c.on('click', p=>{ if(p.data&&p.data.raw) showImageryPlace(p.data.raw); });
  const lg=document.getElementById('im_legend');
  if(lg) lg.innerHTML = data.slice(0,8).map(d=>`<span class="ng-stat">${d.name} <b>${d.song_cnt}</b></span>`).join('');
}
function showImageryPlace(d){
  const html = `<div class="dt-title">🗺️ ${esc(d.name)}</div>
    <div class="dt-sub">出现于 ${d.song_cnt} 首华语歌曲</div>
    <div class="dt-stats"><div class="dt-stat"><div class="v">${d.song_cnt}</div><div class="k">歌曲数</div></div>
      <div class="dt-stat"><div class="v">${fmt(d.heat)}</div><div class="k">累计评论</div></div></div>
    <div class="dt-sec"><h4>唱到「${esc(d.name)}」的代表作</h4>
      ${(d.songs||[]).map(s=>`<div class="dbrow" onclick="window.__showSong&&window.__showSong('${s.song_id||''}')">
        <div class="r-main"><div class="r-title">${esc(s.name)}</div><div class="r-sub">${esc(s.artist)}</div></div>
        <div class="r-meta"><span class="big">${fmt(s.comment_total)}</span>评论</div></div>`).join('')||'<div class="empty">无</div>'}</div>`;
  const dc=document.getElementById('drawer-content'), dr=document.getElementById('drawer');
  if(dc&&dr){ dc.innerHTML=html; dr.classList.add('open'); }
}

// ============== ⏳ 年代时光机（创新） ==============
async function renderEra(){
  const data = await api('era_timeline');
  if(!data||!data.years||!data.years.length){ emptyMsg('c_era_wc','暂无年代数据，请先运行 spark/submit.sh stats.py'); document.getElementById('era_list').innerHTML='<div class="empty">—</div>'; return; }
  const years = data.years;     // [{year, words:[{w,count}], songs:[{name,artist,comment_total}]}]
  const slider = document.getElementById('era_slider');
  slider.min=0; slider.max=years.length-1; slider.value=years.length-1;
  const wc = mkChart('c_era_wc');
  function show(idx){
    const y = years[idx]; document.getElementById('era_year').textContent = y.year+' 年';
    if(y.words&&y.words.length) wc.setOption({ tooltip:{}, series:[{ type:'wordCloud', shape:'circle', sizeRange:[14,60], rotationRange:[-30,30], gridSize:8,
      textStyle:{ color:()=>'rgb('+[220,80+(Math.random()*150|0),120+(Math.random()*100|0)].join(',')+')' },
      data:y.words.map(d=>({name:d.w,value:d.count})) }] }, true);
    else wc.clear();
    const box=document.getElementById('era_list');
    box.innerHTML = (y.songs||[]).map((s,i)=>`<div class="list-item"><div class="li-main">
      <div class="li-title">${i+1}. ${esc(s.name)}</div><div class="li-sub">${esc(s.artist)}</div></div>
      <div class="li-meta">💬${fmt(s.comment_total)}</div></div>`).join('')||'<div class="empty">当年无热歌数据</div>';
  }
  slider.oninput=()=>show(+slider.value);
  show(years.length-1);
}

// init
loadKPI(); loadView('db_song');
