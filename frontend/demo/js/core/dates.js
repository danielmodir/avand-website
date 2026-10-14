const uid = () => Cloud.uuid();

/* User-facing ID (Profile / Friends search / invite links) — distinct from
   uid() above, which is for internal task/habit/event records only. Short
   and name-based rather than a raw code — same style cloud.js derives for
   real accounts (see friendlyUserId() there), just locally random here
   since this is only ever the pre-login placeholder default. */
const genUserId = (name) => {
  const base = (name || 'user').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'USER';
  return base + (1000 + Math.floor(Math.random() * 9000));
};

const pad = n => String(n).padStart(2, '0');

const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

const sameDay = (a,b) => dateKey(a) === dateKey(b);

const addDays = (d,n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };

const WEEKDAY_INDEX = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

function weekStartIndex(){ return WEEKDAY_INDEX[state.settings.weekStartDay] ?? 6; }

function weekdayOrder(){
  const start = weekStartIndex();
  return Array.from({length:7}, (_,i) => (start+i)%7);
}

function startOfWeek(d){
  const r = new Date(d);
  const startIdx = weekStartIndex();
  const offset = (r.getDay() - startIdx + 7) % 7;
  r.setDate(r.getDate()-offset);
  r.setHours(0,0,0,0);
  return r;
}

const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const MONTH_NAMES_FA = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];

const WD_SHORT_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const WD_SHORT_FA = ['ی','د','س','چ','پ','ج','ش'];

const WD_FULL_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const WD_FULL_FA = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

function monthName(i){ return lang()==='fa' ? MONTH_NAMES_FA[i] : MONTH_NAMES_EN[i]; }

function weekdayShort(i){ return lang()==='fa' ? WD_SHORT_FA[i] : WD_SHORT_EN[i]; }

function weekdayFull(i){ return lang()==='fa' ? WD_FULL_FA[i] : WD_FULL_EN[i]; }

function dayLabel(d){
  if(isJalali()){
    const j = toJalali(d.getFullYear(), d.getMonth()+1, d.getDate());
    return `${weekdayFull(d.getDay())}, ${jalaliMonthName(j.jm-1)} ${j.jd}`;
  }
  return `${weekdayFull(d.getDay())}, ${monthName(d.getMonth())} ${d.getDate()}`;
}

const today = new Date(); today.setHours(0,0,0,0);
