function text_(v) { return String(v == null ? '' : v).trim(); }
function urls_(v) {
  return [...new Set((text_(v).match(/https?:\/\/[^\s,<>"]+/g) || []).filter(u => /^https?:\/\//i.test(u)))];
}
function date_(v) {
  const m = text_(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  if (!m) return '';
  const y = +m[3] + (m[3].length === 2 ? 2000 : 0), d = new Date(Date.UTC(y,+m[2]-1,+m[1]));
  return d.getUTCFullYear() === y && d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[1] ? d.toISOString().slice(0,10) : '';
}
function model_(raw, stream, platform, today) {
  stream = text_(stream); platform = text_(platform || 'tg');
  if (!['tg','vk'].includes(platform)) throw Error('Выберите платформу tg или vk');
  const streams = raw.flows.filter(r=>text_(r[0])).map(r=>({code:text_(r[0]),name:text_(r[1])}));
  if (!stream) return {streams,stream:'',platform,blocks:[],upcoming:[],overdue:[],today};
  if (!streams.some(f=>f.code===stream)) throw Error('Такой поток не найден. Проверьте ссылку.');
  const scheduled = new Map();
  raw.schedule.filter(r=>text_(r[0])===stream && text_(r[1])).forEach(r=>{
    const code=text_(r[1]), prev=scheduled.get(code);
    if (prev) throw Error('В расписании повторяется код урока '+code+' для этого потока');
    scheduled.set(code,r);
  });
  const blocks = new Map(), pending=[];
  raw.program.filter(r=>text_(r[0]) && text_(r[1]) && text_(r[2])).forEach(r=>{
    const s=scheduled.get(text_(r[0])); if (!s) return;
    const block=text_(r[1]);
    if (!blocks.has(block)) blocks.set(block,{title:block,outcomes:'',total:0,published:0,lessons:[]});
    const b=blocks.get(block); if(text_(r[5])) b.outcomes=text_(r[5]);
    const links=urls_(s[platform==='tg'?6:7]), date=date_(s[5]);
    const lesson={code:text_(r[0]),title:text_(r[2]),description:text_(r[6]),tags:text_(r[4]).split(/,\s*|\n/).filter(Boolean),format:text_(r[3]),date,links};
    b.total++;
    if(links.length){b.published++;b.lessons.push(lesson);}
    else if(date) pending.push({code:lesson.code,title:lesson.title,block,date});
  });
  const list=[...blocks.values()].map(b=>({...b,status:b.published===b.total?'Блок опубликован':b.published?'Блок выходит':'Скоро'}));
  pending.sort((a,b)=>a.date.localeCompare(b.date));
  return {streams,stream,platform,today,blocks:list,upcoming:pending.filter(l=>l.date>=today).slice(0,3),overdue:pending.filter(l=>l.date<today),scheduleMissing:!scheduled.size};
}

// Local preview uses the existing link access, without changing sharing settings.
window.getLocalParticipantData = async function(stream, platform) {
  function csv(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(cell||row.length){row.push(cell);rows.push(row);}return rows;
  }
  async function read(gid,range){
    const url='https://docs.google.com/spreadsheets/d/1MDk_TjY9ZMwzDi8F-m8RVogtO2TKBF2aDm5L9EwOOfc/gviz/tq?tqx=out:csv&gid='+gid+'&range='+encodeURIComponent(range)+'&_='+Date.now();
    const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Не удалось загрузить программу. Обновите страницу.');
    const text=await response.text();if(/^\s*</.test(text))throw Error('Таблица недоступна для чтения.');return csv(text);
  }
  const [program,flows,schedule]=await Promise.all([read(761826260,'A4:G'),read(622974925,'A4:B'),read(956595678,'A4:H')]);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const result=model_({program,flows,schedule},stream,platform,today);delete result.streams;return result;
};
