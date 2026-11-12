(() => {
  'use strict';
  const STOCKS = [
    ['RELIANCE','Reliance Industries'],['HDFCBANK','HDFC Bank'],['ICICIBANK','ICICI Bank'],['BHARTIARTL','Bharti Airtel'],['INFY','Infosys'],['SBIN','State Bank of India'],['LICI','Life Insurance Corp'],['ITC','ITC'],['HINDUNILVR','Hindustan Unilever'],['LT','Larsen & Toubro'],['BAJFINANCE','Bajaj Finance'],['HCLTECH','HCL Technologies'],['SUNPHARMA','Sun Pharmaceutical'],['MARUTI','Maruti Suzuki'],['TCS','Tata Consultancy Services'],['KOTAKBANK','Kotak Mahindra Bank'],['AXISBANK','Axis Bank'],['M&M','Mahindra & Mahindra'],['NTPC','NTPC'],['TATAMOTORS','Tata Motors'],['ULTRACEMCO','UltraTech Cement'],['ONGC','Oil & Natural Gas Corp'],['TITAN','Titan Company'],['ADANIPORTS','Adani Ports'],['POWERGRID','Power Grid Corp'],['ASIANPAINT','Asian Paints'],['COALINDIA','Coal India'],['ADANIENT','Adani Enterprises'],['BAJAJFINSV','Bajaj Finserv'],['WIPRO','Wipro'],['NESTLEIND','Nestlé India'],['JSWSTEEL','JSW Steel'],['TATASTEEL','Tata Steel'],['GRASIM','Grasim Industries'],['TRENT','Trent'],['HINDALCO','Hindalco Industries'],['TECHM','Tech Mahindra'],['INDUSINDBK','IndusInd Bank'],['SBILIFE','SBI Life Insurance'],['CIPLA','Cipla'],['DRREDDY','Dr. Reddy’s Laboratories'],['EICHERMOT','Eicher Motors'],['APOLLOHOSP','Apollo Hospitals'],['DIVISLAB','Divi’s Laboratories'],['BPCL','Bharat Petroleum'],['BRITANNIA','Britannia Industries'],['TATACONSUM','Tata Consumer Products'],['HEROMOTOCO','Hero MotoCorp'],['BAJAJ-AUTO','Bajaj Auto'],['HDFCLIFE','HDFC Life Insurance'],['SHRIRAMFIN','Shriram Finance'],['BEL','Bharat Electronics'],['PFC','Power Finance Corp'],['RECLTD','REC Limited'],['IOC','Indian Oil Corp'],['DABUR','Dabur India'],['GAIL','GAIL India'],['PIDILITIND','Pidilite Industries'],['AMBUJACEM','Ambuja Cements'],['GODREJCP','Godrej Consumer Products'],['ICICIPRULI','ICICI Prudential Life'],['INDIGO','InterGlobe Aviation'],['MOTHERSON','Samvardhana Motherson'],['CANBK','Canara Bank'],['CHOLAFIN','Cholamandalam Investment'],['JIOFIN','Jio Financial Services'],['TORNTPHARM','Torrent Pharmaceuticals'],['TVSMOTOR','TVS Motor Company'],['HAL','Hindustan Aeronautics'],['VBL','Varun Beverages'],['ZOMATO','Eternal'],['DLF','DLF'],['NAUKRI','Info Edge'],['SIEMENS','Siemens'],['MAXHEALTH','Max Healthcare Institute'],['POLICYBZR','PB Fintech'],['BOSCHLTD','Bosch'],['HAVELLS','Havells India'],['ICICIGI','ICICI Lombard'],['ZYDUSLIFE','Zydus Lifesciences'],['INDUSTOWER','Indus Towers'],['AUROPHARMA','Aurobindo Pharma'],['MARICO','Marico'],['COLPAL','Colgate-Palmolive India'],['LUPIN','Lupin'],['OFSS','Oracle Financial Services'],['BERGEPAINT','Berger Paints India'],['BSE','BSE'],['IREDA','Indian Renewable Energy Dev'],['PAYTM','One 97 Communications'],['DMART','Avenue Supermarts'],['PAGEIND','Page Industries'],['CONCOR','Container Corporation'],['ASHOKLEY','Ashok Leyland'],['MANAPPURAM','Manappuram Finance'],['FEDERALBNK','Federal Bank'],['BANKBARODA','Bank of Baroda'],['PNB','Punjab National Bank'],['YESBANK','Yes Bank'],['IDEA','Vodafone Idea']
  ];
  const $ = (s) => document.querySelector(s);
  const colors = {breakout:'#57d6a0',pullback:'#8ba8ff',inside:'#f4bd67'};
  const typeNames = {breakout:'Resistance breakout',pullback:'EMA pullback',inside:'Inside-bar break'};
  let candlesBySymbol = {};
  let allSignals = [];
  let activeFilter = 'all';
  let activeView = 'scanner';
  let searchTerm = '';
  let customData = false;
  let favorites = new Set(JSON.parse(localStorage.getItem('pivot-watchlist') || '[]'));

  function hashCode(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
  function round(n){return Math.round(n*100)/100}
  function ema(values,period){if(!values.length)return[];const k=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));return out}
  function atr(candles,period=14){const trs=candles.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)));return trs.slice(-period).reduce((a,b)=>a+b,0)/Math.max(1,trs.slice(-period).length)}
  function makeDemoData(){
    const result={};
    STOCKS.forEach(([symbol],idx)=>{
      const rand=rng(hashCode(symbol)), base=150+rand()*2450, step=base*.0028, series=[];let close=base*.78;
      for(let i=0;i<76;i++){
        const drift=step*(.12+rand()*.16), open=close+(rand()-.5)*step*1.1;
        close=Math.max(8,open+drift+(rand()-.49)*step*2.7);
        const high=Math.max(open,close)+rand()*step*.9,low=Math.max(2,Math.min(open,close)-rand()*step*.9);
        const dt=new Date();dt.setDate(dt.getDate()-(75-i));
        if(dt.getDay()===0)dt.setDate(dt.getDate()-2);if(dt.getDay()===6)dt.setDate(dt.getDate()-1);
        series.push({date:dt.toISOString().slice(0,10),open:round(open),high:round(high),low:round(low),close:round(close),volume:Math.round(250000+rand()*1400000)});
      }
      const last=series.length-1, e=ema(series.map(c=>c.close),20), step2=Math.max(1,base*.0028);
      if(idx%3===0){
        const resistance=Math.max(...series.slice(last-20,last).map(c=>c.high));
        const entry=resistance+step2*1.2, op=entry-step2*.35;
        series[last]={...series[last],open:round(op),low:round(op-step2*.25),high:round(entry+step2*.5),close:round(entry),volume:Math.round(series.slice(last-20,last).reduce((a,c)=>a+c.volume,0)/20*1.75)};
      } else if(idx%3===1 && e[last]>e[last-4]){
        const mid=e[last-1];series[last]={...series[last],open:round(mid*.999),low:round(mid*.991),high:round(mid*1.016),close:round(mid*1.012),volume:Math.round(series[last-1].volume*1.08)};
      } else if(idx%3===2){
        const prev=series[last-1], anchor=prev.close;
        series[last-2]={...series[last-2],open:round(anchor*.985),low:round(anchor*.976),high:round(anchor*1.009),close:round(anchor*1.003)};
        series[last-1]={...series[last-1],open:round(anchor*.998),low:round(anchor*.994),high:round(anchor*1.004),close:round(anchor*1.001)};
        const trigger=series[last-1].high;
        series[last]={...series[last],open:round(trigger*.999),low:round(trigger*.996),high:round(trigger*1.012),close:round(trigger*1.009),volume:Math.round(series[last-1].volume*1.35)};
      }
      result[symbol]=series;
    });
    return result;
  }
  function detect(symbol,candles){
    if(candles.length<25)return null;
    const closes=candles.map(c=>c.close),emas=ema(closes,20),last=candles.length-1,c=candles[last],prev=candles[last-1],older=candles[last-2],a=atr(candles);
    const avgVol=candles.slice(-21,-1).reduce((sum,x)=>sum+x.volume,0)/20;
    const priorHigh=Math.max(...candles.slice(-21,-1).map(x=>x.high));
    let type=null,score=58,reason='';
    if(c.close>priorHigh && c.close>emas[last] && c.volume>=avgVol*1.2){type='breakout';score=72+Math.min(18,Math.round((c.volume/avgVol-1)*15));reason=`Closed above the prior 20-session high with ${(c.volume/avgVol).toFixed(1)}× average volume.`}
    else if(c.low<=emas[last]*1.012 && c.close>emas[last] && c.close>c.open && emas[last]>emas[Math.max(0,last-4)]){type='pullback';score=70+Math.min(18,Math.round((c.close-c.low)/Math.max(a,.01)*7));reason='Bullish rejection near a rising 20-day EMA; trend structure remains constructive.'}
    else if(prev.high<older.high && prev.low>older.low && c.close>prev.high && c.close>emas[last]){type='inside';score=71+Math.min(17,Math.round((c.close-prev.high)/Math.max(a,.01)*45));reason='Price closed above the inside bar after a volatility contraction.'}
    if(!type)return null;
    const recentLow=Math.min(...candles.slice(-6,-1).map(x=>x.low));
    let stop=type==='pullback'?Math.min(recentLow,c.low-a*.15):Math.min(recentLow,c.close-a*1.15);
    if(stop>=c.close)stop=c.close-a;
    const risk=c.close-stop;if(risk<=0)return null;
    const target=c.close+risk*2;
    return {symbol,name:(STOCKS.find(x=>x[0]===symbol)||[symbol,symbol])[1],type,entry:c.close,stop,target,rr:2,score,change:((c.close-c.open)/c.open)*100,candles,reason,date:c.date,volumeRatio:c.volume/avgVol,ema:emas[last],riskPct:risk/c.close*100};
  }
  function scan(){allSignals=Object.entries(candlesBySymbol).map(([s,c])=>detect(s,c)).filter(Boolean);render()}
  function money(n){return '₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function svgChart(candles,color){
    const data=candles.slice(-28),min=Math.min(...data.map(x=>x.low)),max=Math.max(...data.map(x=>x.high)),range=max-min||1,w=250,h=58;
    const pts=data.map((c,i)=>`${(i/(data.length-1))*w},${h-((c.close-min)/range)*(h-8)-4}`).join(' ');
    const fill=`${color}22`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="chart-grid" d="M0 16H${w} M0 39H${w}"/><defs><linearGradient id="g-${Math.random().toString(36).slice(2,8)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".2"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.7" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function render(){
    const filtered=allSignals.filter(s=>(activeFilter==='all'||s.type===activeFilter)&&(activeView!=='watchlist'||favorites.has(s.symbol))&&(!searchTerm||s.symbol.toLowerCase().includes(searchTerm)||s.name.toLowerCase().includes(searchTerm)));
    const sort=$('#sort-select').value;
    filtered.sort((a,b)=>sort==='symbol'?a.symbol.localeCompare(b.symbol):sort==='rr'?b.rr-a.rr:b.score-a.score);
    $('#results-count').textContent=`${filtered.length} ${filtered.length===1?'stock':'stocks'}`;
    $('#results-grid').innerHTML=filtered.map(s=>cardHtml(s)).join('');
    $('#empty-state').hidden=filtered.length>0;$('#results-grid').hidden=filtered.length===0;
    $('#metric-scanned').textContent=Object.keys(candlesBySymbol).length;$('#metric-setups').textContent=allSignals.length;
    $('#metric-rr').textContent=allSignals.length?(allSignals.reduce((a,s)=>a+s.rr,0)/allSignals.length).toFixed(1)+'R':'—';
    $('#nav-count').textContent=allSignals.length;$('#watch-count').textContent=favorites.size;
    $('#tab-all').textContent=allSignals.length;$('#tab-breakout').textContent=allSignals.filter(s=>s.type==='breakout').length;$('#tab-pullback').textContent=allSignals.filter(s=>s.type==='pullback').length;$('#tab-inside').textContent=allSignals.filter(s=>s.type==='inside').length;
    $('#data-status').textContent=customData?'LOCAL CSV':'DEMO DATA';$('#market-desc').textContent=customData?'Imported OHLC data · Daily timeframe':'Broad-market universe · Daily timeframe';
  }
  function cardHtml(s){
    const isFav=favorites.has(s.symbol),color=colors[s.type];
    return `<article class="stock-card" data-symbol="${s.symbol}" tabindex="0" aria-label="${s.name} ${typeNames[s.type]} setup"><div class="card-top"><div class="stock-identity"><div class="stock-avatar">${s.symbol.slice(0,2)}</div><div><div class="stock-name">${s.name}</div><div class="stock-symbol">${s.symbol} · NSE</div></div></div><button class="score-badge favorite-button" data-fav="${s.symbol}" title="${isFav?'Remove from':'Add to'} watchlist">${isFav?'★':'✦'} ${s.score}</button></div><div class="setup-label"><i class="legend-dot" style="background:${color}"></i>${typeNames[s.type]}<span class="setup-type">DAILY</span></div><div class="price-row"><span class="last-price">${money(s.entry)}</span><span class="price-change">${s.change>=0?'+':''}${s.change.toFixed(2)}%</span></div><div class="chart-wrap">${svgChart(s.candles,color)}</div><div class="levels"><div class="level-entry"><span class="level-label">ENTRY</span><span class="level-value">${money(s.entry)}</span></div><div class="level-stop"><span class="level-label">INVALIDATION</span><span class="level-value">${money(s.stop)}</span></div><div class="level-target"><span class="level-label">2R TARGET</span><span class="level-value">${money(s.target)}</span></div></div><div class="card-foot"><span>Risk <strong>${s.riskPct.toFixed(1)}%</strong> · R/R <strong>1:2</strong></span><span>${new Date(s.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} <span class="card-arrow">↗</span></span></div></article>`;
  }
  function showDetails(symbol){
    const s=allSignals.find(x=>x.symbol===symbol);if(!s)return;
    $('#detail-content').innerHTML=`<div class="eyebrow"><span class="eyebrow-line" style="background:${colors[s.type]}"></span> ${typeNames[s.type].toUpperCase()} · NSE</div><h2>${s.name}</h2><div class="dialog-subtitle">${s.symbol} · Daily swing setup · Signal date ${s.date}</div><div class="detail-levels"><div class="detail-level"><span>ENTRY</span><strong style="color:#b8caff">${money(s.entry)}</strong></div><div class="detail-level"><span>INVALIDATION</span><strong style="color:#ff989d">${money(s.stop)}</strong></div><div class="detail-level"><span>2R REFERENCE</span><strong style="color:#8de1b5">${money(s.target)}</strong></div></div><div class="detail-notes"><strong>Why it appeared</strong><br>${s.reason}<br>Estimated risk: ${s.riskPct.toFixed(2)}% · Relative volume: ${s.volumeRatio.toFixed(2)}× · Setup score: ${s.score}/100</div><p>Levels are illustrative calculations from the imported candles, not trade instructions. Validate against current market prices and liquidity.</p>`;
    $('#detail-dialog').showModal();
  }
  function parseCSV(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw new Error('CSV needs a header and at least one candle.');
    const headers=lines[0].split(',').map(x=>x.trim().toLowerCase().replace(/^"|"$/g,''));
    const find=(names)=>headers.findIndex(h=>names.includes(h));
    const ix={date:find(['date','datetime','timestamp']),symbol:find(['symbol','ticker','stock']),open:find(['open','o']),high:find(['high','h']),low:find(['low','l']),close:find(['close','adj close','c']),volume:find(['volume','vol','v'])};
    if(['date','symbol','open','high','low','close','volume'].some(k=>ix[k]<0))throw new Error('Required columns: date, symbol, open, high, low, close, volume.');
    const grouped={};
    lines.slice(1).forEach((line,i)=>{const cols=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));if(cols.length<headers.length)return;const symbol=cols[ix.symbol].toUpperCase().replace(/\.NS$/,'').replace(/\s/g,'');const c={date:cols[ix.date].slice(0,10),open:Number(cols[ix.open]),high:Number(cols[ix.high]),low:Number(cols[ix.low]),close:Number(cols[ix.close]),volume:Number(cols[ix.volume])};if(!symbol||Object.values(c).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw new Error(`Invalid numeric data on row ${i+2}.`);if(c.low>c.high||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close))throw new Error(`Invalid OHLC range on row ${i+2}.`);(grouped[symbol]??=[]).push(c)});
    Object.values(grouped).forEach(a=>a.sort((x,y)=>x.date.localeCompare(y.date)));
    const enough=Object.fromEntries(Object.entries(grouped).filter(([,cs])=>cs.length>=25));if(!Object.keys(enough).length)throw new Error('No symbols have at least 25 valid candles.');return enough;
  }
  function toast(message){const t=document.createElement('div');t.className='toast';t.textContent=message;document.body.append(t);setTimeout(()=>t.remove(),3200)}
  function setFilter(value){activeFilter=value;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===value));render()}
  function init(){
    candlesBySymbol=makeDemoData();scan();
    $('#today-label').textContent=new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
    document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setFilter(t.dataset.filter)));
    $('#search-input').addEventListener('input',e=>{searchTerm=e.target.value.trim().toLowerCase();render()});$('#sort-select').addEventListener('change',render);
    $('#upload-button').addEventListener('click',()=>$('#csv-file').click());
    $('#csv-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{candlesBySymbol=parseCSV(await file.text());customData=true;activeView='scanner';document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view==='scanner'));scan();toast(`Loaded ${Object.keys(candlesBySymbol).length} symbols from your CSV.`)}catch(err){toast(err.message)}e.target.value=''});
    $('#results-grid').addEventListener('click',e=>{const fav=e.target.closest('[data-fav]');if(fav){e.stopPropagation();const sym=fav.dataset.fav;if(favorites.has(sym))favorites.delete(sym);else favorites.add(sym);localStorage.setItem('pivot-watchlist',JSON.stringify([...favorites]));render();return}const card=e.target.closest('[data-symbol]');if(card)showDetails(card.dataset.symbol)});
    $('#results-grid').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.stock-card')){e.preventDefault();showDetails(e.target.dataset.symbol)}});
    document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>{activeView=n.dataset.view;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x===n));render()}));
    $('#reset-demo').addEventListener('click',()=>{candlesBySymbol=makeDemoData();customData=false;activeView='scanner';activeFilter='all';searchTerm='';$('#search-input').value='';setFilter('all');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view==='scanner'));toast('Demo universe restored.')});
    $('#clear-filters').addEventListener('click',()=>{activeFilter='all';activeView='scanner';searchTerm='';$('#search-input').value='';setFilter('all');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view==='scanner'))});
    $('#help-button').addEventListener('click',()=>$('#info-dialog').showModal());$('#methodology-link').addEventListener('click',e=>{e.preventDefault();$('#info-dialog').showModal()});
  }
  init();
})();
