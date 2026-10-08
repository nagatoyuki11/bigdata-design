// 华语歌曲大数据库 · 四大模块（歌曲/歌手/歌词/评论）复合检索前端
// 数据来自 server.js 的 /api/search/* （SQLite + FTS5 检索层）。
(function(){
'use strict';
const E = s => String(s==null?'':s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const F = n => { n=+n||0; return n>=1e8?(n/1e8).toFixed(1)+'亿':n>=1e4?(n/1e4).toFixed(1)+'万':n; };
const $ = id => document.getElementById(id);
const dur = s => { s=+s||0; return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
const SENT_CLS = { '正向':'pos','负向':'neg','中性':'neu' };
async function jget(url){ try{ const r=await fetch(url); if(!r.ok) return null; return await r.json(); }catch(e){ return null; } }

// 通用分页器
function pager(box, total, page, limit, onGo){
  const pages = Math.max(Math.ceil(total/limit),1);
  box.innerHTML = `<button ${page<=0?'disabled':''} data-d="-1">‹ 上一页</button>
    <span class="pg-info">${page+1} / ${pages}</span>
    <button ${page>=pages-1?'disabled':''} data-d="1">下一页 ›</button>`;
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>onGo(page+(+b.dataset.d)));
}
function countTxt(el, total, mode){
  el.innerHTML = `共 <b>${F(total)}</b> 条结果` + (mode==='like'?'<span class="mode-tag">原文回退匹配</span>':mode==='fts'?'<span class="mode-tag">FTS5 全文</span>':'');
}
function highlightFrag(frag){
  // searchdb 用 [ ] 包裹 FTS snippet 命中词
  return E(frag).replace(/\[/g,'<span class="frag-hl">').replace(/\]/g,'</span>');
}

// ---------- 详情抽屉 ----------
const drawer = $('drawer'), dcontent = $('drawer-content');
let _backArtistId = null;   // 从歌手详情进入歌曲详情时记录歌手ID，供"返回"按钮使用
function openDrawer(html){ dcontent.innerHTML=html; drawer.classList.add('open'); }
function closeDrawer(){ drawer.classList.remove('open'); _backArtistId = null; }
drawer.querySelector('.drawer-mask').onclick = closeDrawer;
drawer.querySelector('.drawer-x').onclick = closeDrawer;
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });

async function showSong(id, fromArtistId){
  _backArtistId = fromArtistId || null;
  const d = await jget('/api/song/'+id); if(!d||!d.song) return;
  const s=d.song;
  const sentTotal=(d.sentiment||[]).reduce((a,b)=>a+b.c,0);
  const col={'正向':'#22c55e','中性':'#6b7394','负向':'#ef4444'};
  const bar=sentTotal?`<div class="dt-sent-bar">`+(d.sentiment||[]).map(x=>{
    const w=Math.round(x.c/sentTotal*100); return w>0?`<span style="width:${w}%;background:${col[x.sentiment]||'#888'}">${w>10?x.sentiment+' '+w+'%':''}</span>`:''; }).join('')+`</div>`:'';
  const backBtn = _backArtistId ? `<button class="dt-back" onclick="window.__goBackToArtist()">← 返回歌手</button>` : '';
  openDrawer(`${backBtn}
    <div class="dt-title">${E(s.name)}</div>
    <div class="dt-sub">🎤 ${E(s.artist_name)} · 📅 ${s.year||'?'} · ⏱ ${dur(s.duration_sec)}</div>
    <div class="dt-album">💿 专辑：${E(s.album||'未收录')}</div>
    <a class="dt-play" href="https://music.163.com/song?id=${encodeURIComponent(s.song_id)}" target="_blank" rel="noopener noreferrer">▶ 网易云播放</a>
    <div class="dt-stats">
      <div class="dt-stat"><div class="v">${F(s.comment_total)}</div><div class="k">真实评论</div></div>
      <div class="dt-stat"><div class="v">${F(s.total_liked)}</div><div class="k">评论点赞</div></div>
      <div class="dt-stat"><div class="v">${s.pop||0}</div><div class="k">官方热度</div></div>
      <div class="dt-stat"><div class="v">${dur(s.duration_sec)}</div><div class="k">时长</div></div>
      <div class="dt-stat"><div class="v">${E(s.topic_name||'—')}</div><div class="k">主题</div></div>
    </div>
    ${bar?`<div class="dt-sec"><h4>评论情感分布（采样 ${F(sentTotal)} 条）</h4>${bar}</div>`:''}
    ${d.lyric&&d.lyric.lyric?`<div class="dt-sec"><h4>歌词</h4><div class="dt-lyric">${E(d.lyric.lyric)}</div></div>`:''}
    <div class="dt-sec"><h4>热门评论 Top ${(d.comments||[]).length}</h4>
      ${(d.comments||[]).map(c=>`<div class="dt-cmt"><div class="c-txt">${E(c.content)}</div>
        <div class="c-meta">👍 ${F(c.liked)} · <span class="badge ${SENT_CLS[c.sentiment]||'neu'}">${E(c.sentiment||'')}</span></div></div>`).join('')||'<div class="empty">暂无评论</div>'}
    </div>`);
}
async function showArtist(id){
  const d = await jget('/api/artist/'+encodeURIComponent(id)); if(!d||!d.artist) return;
  const a=d.artist;
  const photoHtml = a.photo ? `<img class="dt-artist-photo" src="${E(a.photo)}" referrerpolicy="no-referrer" alt="${E(a.artist_name)}" onerror="this.style.display='none'" />` : '';
  openDrawer(`<div class="dt-title">${E(a.artist_name)}</div>
    <div class="dt-sub">华语歌手画像${!a.authentic?' · <span class="badge neu">未达标</span>':''}</div>
    ${photoHtml}
    <div class="dt-stats">
      <div class="dt-stat"><div class="v">${a.song_num}</div><div class="k">作品数</div></div>
      <div class="dt-stat"><div class="v">${F(a.comments)}</div><div class="k">真实总评论</div></div>
      <div class="dt-stat"><div class="v">${F(a.likes)}</div><div class="k">评论总点赞</div></div>
      <div class="dt-stat"><div class="v">${a.influence}</div><div class="k">影响力</div></div>
      <div class="dt-stat"><div class="v">${a.avg_pop}</div><div class="k">平均热度</div></div>
    </div>
    ${a.style_words?`<div class="dt-sec"><h4>词风关键词</h4><div>${a.style_words.split(',').slice(0,12).map(w=>`<span class="tag theme">${E(w)}</span>`).join('')}</div></div>`:''}
	    <div class="dt-sec"><h4>代表作（按真实评论数）</h4>
	      ${(d.songs||[]).map(s=>`<div class="dbrow" onclick="window.__showSong('${s.song_id}','${a.artist_id}')"><div class="r-main">
	        <div class="r-title">${E(s.name)}</div><div class="r-sub">${s.year||'?'}</div></div>
	        <div class="r-meta"><span class="big">${F(s.comment_total)}</span>评论</div></div>`).join('')||'<div class="empty">无</div>'}
	    </div>
	    <div class="dt-sec"><button class="dt-net-btn" onclick="window.__showArtistNetwork('${E(a.artist_name)}')">🕸️ 查看合作网络</button></div>`);
}
window.__showSong = showSong;  // 供抽屉内代表作点击
window.__showArtist = showArtist;  // 供合作网络点击节点
window.__goBackToArtist = function(){
  if(_backArtistId){
    const aid = _backArtistId;
    _backArtistId = null;
    showArtist(aid);
  }
};

// 独立合作网络详情抽屉（以该歌手为中心）
window.__showArtistNetwork = async function(artistName){
  try {
    const cache = window.__netCache || (window.__getNetCache && await window.__getNetCache());
    if(!cache || !cache.nodes || !cache.nodes.length){ alert('暂无合作网络数据'); return; }
    const { nodes, edges } = cache;
    const center = nodes.find(n=>n.name===artistName);
    if(!center){ alert('该歌手暂未在合作网络中'); return; }
    const neighborSet = new Set([artistName]);
    const subEdges = [];
    for(const e of edges){
      if(e.source===artistName){ neighborSet.add(e.target); subEdges.push(e); }
      else if(e.target===artistName){ neighborSet.add(e.source); subEdges.push(e); }
    }
    const subNodes = nodes.filter(n=>neighborSet.has(n.name));
    if(subNodes.length<=1){ alert('该歌手暂无直接合作者'); return; }
    openDrawer(`<div class="dt-title">🕸️ ${E(artistName)} 合作网络</div>
      <div class="dt-sub">${subNodes.length} 位歌手 · ${subEdges.length} 条合作边</div>
      <div id="dt-net-full" class="chart" style="height:62vh;margin-top:12px"><span class="empty">加载中...</span></div>`);
    // 等 DOM 就绪后渲染图表
    setTimeout(()=>{
      const el = document.getElementById('dt-net-full');
      if(!el || !document.body.contains(el)) return;
      if(typeof echarts === 'undefined'){ el.innerHTML='<span class="empty">图表库未加载</span>'; return; }
      const maxPR = Math.max(...subNodes.map(n=>n.pagerank), 0.01);
      const COMM = ['#e0143c','#5b8ff9','#22c55e','#ffb347','#a855f7','#38bdf8','#ff7aa2','#f59e0b','#14b8a6','#9aa3bf'];
      const chart = echarts.init(el);
      if(!chart){ el.innerHTML='<span class="empty">图表初始化失败</span>'; return; }
      chart.setOption({
        backgroundColor:'transparent',
        tooltip:{ formatter:p=> p.dataType==='edge'
          ? `${p.data.source} — ${p.data.target}<br/>合作 ${p.data.weight} 次`
          : `<b>${p.data.name}</b><br/>影响力(PR) ${(+p.value).toFixed(3)}` },
        series:[{ type:'graph', layout:'force', roam:true, draggable:true,
          data: subNodes.map(n=>{
            const isC = n.name===artistName;
            return { id:n.name, name:n.name,
              symbolSize: isC?28: (8+Math.sqrt(n.pagerank/maxPR)*42),
              value:n.pagerank, category:n.community<0?COMM.length-1:n.community,
              itemStyle: isC?{borderColor:'#fff',borderWidth:3,shadowBlur:22,shadowColor:'#fff'}:undefined,
              label:{ show: isC || n.pagerank>maxPR*0.4 } };
          }),
          edges: subEdges.map(e=>({source:e.source,target:e.target,weight:e.weight,
            lineStyle:{width:Math.min(0.4+e.weight*0.5,6)}})),
          categories: COMM.map((col,i)=>({name:i===COMM.length-1?'其他':('社群'+(i+1)),itemStyle:{color:col}})),
          force:{ repulsion: 350, edgeLength:[80,240], gravity:0.04, friction:0.16 },
          lineStyle:{ color:'source', opacity:0.5, curveness:0.12 },
          label:{ color:'#e9ecf5', fontSize:11, position:'right' },
          scaleLimit:{min:0.3,max:5} }]
      });
      chart.on('click', p=>{
        if(p.dataType==='node' && window.__showArtist) window.__showArtist(p.data.name);
      });
    }, 200);
  } catch(e){ alert('合作网络加载失败'); }
};

// 删除旧的内嵌 renderArtistNetwork


// ============ ① 歌曲库 ============
function db_song(){
  let page=0;
  const params = ()=>{ const p=new URLSearchParams();
    const add=(k,id)=>{ const v=$(id).value.trim(); if(v) p.set(k,v); };
    add('q','fs_q'); add('yearMin','fs_ymin'); add('yearMax','fs_ymax');
    add('cmtMin','fs_cmin'); add('cmtMax','fs_cmax'); add('durMin','fs_dmin');
    p.set('sort',$('fs_sort').value); p.set('limit','20'); p.set('page',page); return p; };
  async function run(pg){ page=Math.max(pg||0,0);
    const d=await jget('/api/search/songs?'+params());
    const box=$('fs_list'); if(!d){ box.innerHTML='<div class="empty">检索库未就绪</div>'; return; }
    countTxt($('fs_count'), d.total);
    box.innerHTML = d.rows.length ? d.rows.map(s=>`<div class="dbrow" data-id="${s.song_id}">
      <div class="r-main"><div class="r-title">${E(s.name)}${s.topic_name?`<span class="badge topic">${E(s.topic_name)}</span>`:''}</div>
        <div class="r-sub">${E(s.artist_name)} · ${E(s.album||'未收录')} · ${s.year||'?'} · ${dur(s.duration_sec)}</div>
        <div class="r-tags"><span class="r-tag">🎤 ${E(s.artist_name)}</span><span class="r-tag">💿 ${E(s.album||'未收录')}</span><span class="r-tag">📅 ${s.year||'?'}</span></div></div>
      <div class="r-meta"><span class="big">${F(s.comment_total)}</span>评论 · 👍${F(s.total_liked)}</div></div>`).join('')
      : '<div class="empty">无匹配结果，试试放宽条件</div>';
    box.querySelectorAll('.dbrow').forEach(r=>r.onclick=()=>showSong(r.dataset.id));
    pager($('fs_pager'), d.total, page, d.limit, run);
  }
  $('fs_go').onclick=()=>run(0);
  $('fs_reset').onclick=()=>{ ['fs_q','fs_ymin','fs_ymax','fs_cmin','fs_cmax','fs_dmin'].forEach(i=>$(i).value=''); $('fs_sort').value='comment'; run(0); };
  $('fs_q').onkeydown=e=>{ if(e.key==='Enter') run(0); };
  jget('/api/dbstats').then(s=>{ if(s) $('db_song_total').textContent=s.songs.toLocaleString(); });
  run(0);
}

// ============ ② 歌手库 ============
function db_artist(){
  let page=0;
  const params=()=>{ const p=new URLSearchParams();
    const q=$('fa_q').value.trim(), h=$('fa_hmin').value.trim(), s=$('fa_smin').value.trim();
    if(q)p.set('q',q); if(h)p.set('heatMin',h); if(s)p.set('songMin',s);
    if($('fa_all') && $('fa_all').checked) p.set('all','1');
    p.set('limit','20'); p.set('page',page); return p; };
  async function run(pg){ page=Math.max(pg||0,0);
    const d=await jget('/api/search/artists?'+params()); const box=$('fa_list');
    if(!d){ box.innerHTML='<div class="empty">检索库未就绪</div>'; return; }
    countTxt($('fa_count'), d.total);
    box.innerHTML = d.rows.length ? d.rows.map(a=>`<div class="dbrow" data-id="${E(a.artist_id)}">
      <div class="r-main"><div class="r-title">${E(a.artist_name)}</div>
        <div class="r-sub">作品 ${a.song_num} · 真实评论 ${F(a.comments)} · 点赞 ${F(a.likes)}${a.style_words?' · '+E(a.style_words.split(',').slice(0,5).join(' ')):''}</div></div>
      <div class="r-meta"><span class="big">${a.influence}</span>影响力</div></div>`).join('')
      : '<div class="empty">无匹配歌手</div>';
    box.querySelectorAll('.dbrow').forEach(r=>r.onclick=()=>showArtist(r.dataset.id));
    pager($('fa_pager'), d.total, page, d.limit, run);
  }
  $('fa_go').onclick=()=>run(0);
  $('fa_reset').onclick=()=>{ ['fa_q','fa_hmin','fa_smin'].forEach(i=>$(i).value=''); if($('fa_all'))$('fa_all').checked=false; run(0); };
  $('fa_q').onkeydown=e=>{ if(e.key==='Enter') run(0); };
  const _faAll=$('fa_all'); if(_faAll) _faAll.onchange=()=>run(0);
  run(0);
}

// ============ ③ 歌词全文检索 ============
function db_lyric(){
  let page=0;
  // 主题下拉来自 topic_words.json
  jget('/api/topic_words').then(tw=>{ if(tw&&tw.length){ const sel=$('fl_topic');
    const names=[...new Set(tw.map(t=>t.name).filter(Boolean))];
    sel.innerHTML='<option value="">全部主题</option>'+names.map(n=>`<option value="${E(n)}">${E(n)}</option>`).join(''); } });
  const params=()=>{ const p=new URLSearchParams();
    const q=$('fl_q').value.trim(), t=$('fl_topic').value;
    if(q)p.set('q',q); if(t)p.set('topic',t); p.set('limit','15'); p.set('page',page); return p; };
  async function run(pg){ page=Math.max(pg||0,0);
    const d=await jget('/api/search/lyrics?'+params()); const box=$('fl_list');
    if(!d){ box.innerHTML='<div class="empty">检索库未就绪</div>'; return; }
    countTxt($('fl_count'), d.total, d.mode);
    box.innerHTML = d.rows.length ? d.rows.map(l=>`<div class="dbrow" data-id="${l.song_id}">
      <div class="r-main"><div class="r-title">${E(l.name)}${l.topic_name?`<span class="badge topic">${E(l.topic_name)}</span>`:''}</div>
        <div class="r-sub">${E(l.artist_name)} · ${l.year||'?'} · ${l.word_count}词</div>
        <div class="frag">${highlightFrag(l.frag||'')}</div></div></div>`).join('')
      : '<div class="empty">无匹配歌词</div>';
    box.querySelectorAll('.dbrow').forEach(r=>r.onclick=()=>showSong(r.dataset.id));
    pager($('fl_pager'), d.total, page, d.limit, run);
  }
  $('fl_go').onclick=()=>run(0);
  $('fl_reset').onclick=()=>{ $('fl_q').value=''; $('fl_topic').value=''; run(0); };
  $('fl_q').onkeydown=e=>{ if(e.key==='Enter') run(0); };
  run(0);
}

// ============ ④ 评论全文检索 ============
function db_comment(){
  let page=0;
  const params=()=>{ const p=new URLSearchParams();
    const q=$('fc_q').value.trim(), s=$('fc_sent').value, l=$('fc_lmin').value.trim();
    if(q)p.set('q',q); if(s)p.set('sentiment',s); if(l)p.set('likedMin',l);
    if($('fc_sort').value==='relevance')p.set('sort','relevance');
    p.set('limit','20'); p.set('page',page); return p; };
  async function run(pg){ page=Math.max(pg||0,0);
    const d=await jget('/api/search/comments?'+params()); const box=$('fc_list');
    if(!d){ box.innerHTML='<div class="empty">检索库未就绪</div>'; return; }
    countTxt($('fc_count'), d.total, d.mode);
    box.innerHTML = d.rows.length ? d.rows.map(c=>`<div class="dbrow" data-id="${c.song_id}">
      <div class="r-main"><div class="r-title" style="font-weight:500;font-size:14px;line-height:1.55">${E(c.content)}</div>
        <div class="r-sub">《${E(c.name||'?')}》— ${E(c.artist_name||'?')} <span class="badge ${SENT_CLS[c.sentiment]||'neu'}">${E(c.sentiment||'')}</span></div></div>
      <div class="r-meta"><span class="big">👍${F(c.liked)}</span></div></div>`).join('')
      : '<div class="empty">无匹配评论</div>';
    box.querySelectorAll('.dbrow').forEach(r=>r.onclick=()=>showSong(r.dataset.id));
    pager($('fc_pager'), d.total, page, d.limit, run);
  }
  $('fc_go').onclick=()=>run(0);
  $('fc_reset').onclick=()=>{ $('fc_q').value=''; $('fc_sent').value=''; $('fc_lmin').value=''; $('fc_sort').value='liked'; run(0); };
  $('fc_q').onkeydown=e=>{ if(e.key==='Enter') run(0); };
  run(0);
}

window.DB = { db_song, db_artist, db_lyric, db_comment };
})();
