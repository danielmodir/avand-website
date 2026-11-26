/* Central app color source. Explicit art-directed light/dark palettes; no inversion.
   All component colors below are semantic tokens or compatibility aliases. */
(function(global){
'use strict';
var palettes = [
  {
    "id": "sustainable-tangerine",
    "name": "Sustainable Tangerine",
    "nameFa": "نارنجی پایدار",
    "description": "Warm, minimal and energetic",
    "descriptionFa": "گرم، مینیمال و پرانرژی",
    "original": [
      "#FAF3E1",
      "#F5E7C6",
      "#FF6D1F",
      "#222222"
    ],
    "light": [
      "#FAF3E1",
      "#FFFDF7",
      "#F5E7C6",
      "#B84412",
      "#FF6D1F",
      "#F5E7C6",
      "#222222",
      "#5F584B",
      "#FFFFFF"
    ],
    "dark": [
      "#141414",
      "#222222",
      "#302B24",
      "#FF6D1F",
      "#FF995C",
      "#F5E7C6",
      "#FAF3E1",
      "#D4C5A8",
      "#141414"
    ]
  },
  {
    "id": "emerald-nature",
    "name": "Emerald Nature",
    "nameFa": "طبیعت زمردی",
    "description": "Natural, calm and balanced",
    "descriptionFa": "طبیعی، آرام و متعادل",
    "original": [
      "#F4F1EB",
      "#7AA05A",
      "#2D5A4A",
      "#0D4C3C"
    ],
    "light": [
      "#F4F1EB",
      "#FFFFFF",
      "#E2EAD9",
      "#2D5A4A",
      "#0D4C3C",
      "#7AA05A",
      "#0D4C3C",
      "#516457",
      "#FFFFFF"
    ],
    "dark": [
      "#0E1C18",
      "#162D26",
      "#214137",
      "#96BE74",
      "#2D5A4A",
      "#7AA05A",
      "#F4F1EB",
      "#C9D8CA",
      "#0E1C18"
    ]
  },
  {
    "id": "ocean-contrast",
    "name": "Ocean Contrast",
    "nameFa": "کنتراست اقیانوسی",
    "description": "Clean, professional and dynamic",
    "descriptionFa": "شفاف، حرفه‌ای و پویا",
    "original": [
      "#F9F9F9",
      "#004E72",
      "#FF6E42",
      "#092634"
    ],
    "light": [
      "#F9F9F9",
      "#FFFFFF",
      "#E6F0F5",
      "#004E72",
      "#FF6E42",
      "#004E72",
      "#092634",
      "#52636D",
      "#FFFFFF"
    ],
    "dark": [
      "#081B27",
      "#092634",
      "#12394B",
      "#62BFDD",
      "#FF8E6B",
      "#004E72",
      "#F9F9F9",
      "#BCD2DC",
      "#092634"
    ]
  },
  {
    "id": "earthy-harmony",
    "name": "Earthy Harmony",
    "nameFa": "هماهنگی خاکی",
    "description": "Organic, mature and warm",
    "descriptionFa": "طبیعی، پخته و گرم",
    "original": [
      "#EFE9D7",
      "#7D2826",
      "#898861",
      "#343723"
    ],
    "light": [
      "#EFE9D7",
      "#FFF9ED",
      "#DADBC6",
      "#7D2826",
      "#343723",
      "#898861",
      "#343723",
      "#575846",
      "#FFFFFF"
    ],
    "dark": [
      "#1D2118",
      "#343723",
      "#44482F",
      "#E5A19C",
      "#7D2826",
      "#B5B38C",
      "#EFE9D7",
      "#D2C9AF",
      "#1D2118"
    ]
  },
  {
    "id": "organic-apricot",
    "name": "Organic Apricot",
    "nameFa": "زردآلوی طبیعی",
    "description": "Soft, welcoming and refined",
    "descriptionFa": "ملایم، صمیمی و ظریف",
    "original": [
      "#F5E6C5",
      "#D78B30",
      "#9F886F",
      "#3F422E"
    ],
    "light": [
      "#F5E6C5",
      "#FFF8E8",
      "#E7D5B8",
      "#A35D16",
      "#D78B30",
      "#9F886F",
      "#3F422E",
      "#625B4B",
      "#FFFFFF"
    ],
    "dark": [
      "#1B1E16",
      "#2B3022",
      "#3F422E",
      "#E7A94D",
      "#D78B30",
      "#B5A089",
      "#F5E6C5",
      "#D7C2A1",
      "#1B1E16"
    ]
  },
  {
    "id": "midnight-luxe",
    "name": "Midnight Luxe",
    "nameFa": "نیمه‌شب لوکس",
    "description": "Elegant, minimal and sophisticated",
    "descriptionFa": "شیک، مینیمال و سنجیده",
    "original": [
      "#171717",
      "#6B7280",
      "#D4AF37",
      "#F5E6C8"
    ],
    "light": [
      "#FBF8F1",
      "#FFFFFF",
      "#F1E8D7",
      "#8C6B15",
      "#D4AF37",
      "#6B7280",
      "#171717",
      "#4B5563",
      "#FFFFFF"
    ],
    "dark": [
      "#171717",
      "#242424",
      "#303030",
      "#D4AF37",
      "#F5E6C8",
      "#6B7280",
      "#F5E6C8",
      "#D0C4AD",
      "#171717"
    ]
  }
];
var defaultId = 'sustainable-tangerine';
function validId(id){ return palettes.some(function(p){ return p.id === id; }) ? id : defaultId; }
function validMode(mode){ return ['light','dark','system'].indexOf(mode) >= 0 ? mode : 'system'; }
function luminance(hex){ var c=hex.slice(1).match(/../g).map(function(v){var n=parseInt(v,16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
function contrast(a,b){var x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function ink(bg){return contrast('#FFFFFF',bg)>contrast('#141414',bg)?'#FFFFFF':'#141414';}
function mix(a,b,t){return '#'+a.slice(1).match(/../g).map(function(v,i){return Math.round(parseInt(v,16)*(1-t)+parseInt(b.slice(1+i*2,3+i*2),16)*t).toString(16).padStart(2,'0');}).join('').toUpperCase();}
function tokens(id,mode){
 var p=palettes.filter(function(p){return p.id===validId(id);})[0],v=p[mode==='light'?'light':'dark'],dark=mode!=='light';
 var bg=v[0],surface=v[1],variant=v[2],primary=v[3],accent=v[4],secondary=v[5],text=v[6],muted=v[7],on=v[8];
 // Supplemental opaque states are mixed once, then checked against real surfaces.
 var away=on==='#FFFFFF'?'#141414':'#FFFFFF';
 var hover=mix(primary,away,.09),pressed=mix(primary,away,.17);
 var border=mix(surface,text,.74),focus=primary;
 var success=dark?'#97D5AA':'#23603B',warning=dark?'#F2CF80':'#795006',error=dark?'#FFB4AB':'#A52626',info=dark?'#9CD1EC':'#185878';
 var t={background:bg,backgroundSecondary:variant,surface:surface,surfaceVariant:variant,surfaceElevated:surface,surfaceOverlay:surface,
 primary:primary,primaryHover:hover,primaryPressed:pressed,onPrimary:on,secondary:secondary,onSecondary:ink(secondary),accent:accent,onAccent:ink(accent),
 textPrimary:text,textSecondary:muted,textMuted:muted,textDisabled:mix(surface,text,.45),textInverse:ink(text),textOnPrimary:on,
 cardBackground:surface,inputBackground:surface,inputBorder:border,inputFocusBorder:focus,buttonBackground:primary,buttonText:on,iconPrimary:text,iconSecondary:muted,
 divider:mix(surface,text,.22),border:border,focusRing:focus,selectedBackground:primary,selectedText:on,hoverBackground:variant,disabledBackground:variant,
 success:success,onSuccess:ink(success),warning:warning,onWarning:ink(warning),error:error,onError:ink(error),info:info,onInfo:ink(info),
 shadow:dark?'#000000':'#302A20',overlay:'#141414',scrim:'#141414'};
 return t;
}
function kebab(s){return s.replace(/[A-Z]/g,function(c){return '-'+c.toLowerCase();});}
function variables(id,mode){
 var t=tokens(id,mode),v={};Object.keys(t).forEach(function(k){v['--'+kebab(k)]=t[k];});
 var aliases={bg:'background','bg-soft':'backgroundSecondary',card:'cardBackground',text:'textPrimary','text-muted':'textSecondary','primary-text':'primary','nav-bg':'surface','nav-icon':'iconSecondary',danger:'error',pms:'warning',holiday:'error','range-mark':'primary','on-range-mark':'onPrimary','on-banner':'textPrimary','banner-bg':'surfaceVariant','banner-btn-bg':'surface','banner-btn-bg-hover':'surfaceVariant','banner-btn-border':'border','surface-1':'surface','surface-2':'surfaceVariant','surface-solid':'surfaceElevated','surface-panel':'surface','glass':'surface','edge':'divider','edge-strong':'border','period-ring-rest':'divider','select-ring':'primary','range-band':'surfaceVariant','primary-soft':'surfaceVariant','danger-soft':'surfaceVariant','pms-soft':'surfaceVariant','gradient-brand':'primary','banner-edge':'divider'};
 Object.keys(aliases).forEach(function(k){v['--'+k]=t[aliases[k]];});
 ['glow-orange','glow-navy'].forEach(function(k){v['--'+k]='transparent';});
 ['shadow-glow','glow-accent','glow-today','glow-switch','glow-mark','select-glow','edge-highlight'].forEach(function(k){v['--'+k]='0 0 0 transparent';});
 v['--period-flow']=mode==='light'?'#A52665':'#FFB4D0';v['--period-flow-ink']=v['--period-flow'];v['--period-pms']=t.warning;v['--period-pms-ink']=t.warning;v['--period-fertile']=t.info;v['--period-fertile-ink']=t.info;v['--period-blood']=t.error;
 v['--primary-text']=[t.background,t.surface,t.surfaceVariant].every(function(bg){return contrast(t.primary,bg)>=4.5;})?t.primary:t.textPrimary;
 v['--shadow']='0 6px 18px '+t.shadow+'18';v['--shadow-soft-sm']='0 2px 8px '+t.shadow+'14';v['--shadow-soft-lg']='0 8px 24px '+t.shadow+'20';v['--select-lift']=v['--shadow'];v['--shadow-hover']=v['--shadow'];
 v['--overlay']=t.overlay+'99';v['--scrim']=t.scrim+'B3';
 return v;
}
var media=global.matchMedia?global.matchMedia('(prefers-color-scheme: dark)'):null;
function resolve(mode){return validMode(mode)==='system'?(media&&media.matches?'dark':'light'):validMode(mode);}
function read(){var id=defaultId,mode='system';try{id=localStorage.getItem('selectedThemeId')||localStorage.getItem('toojibee-palette');mode=localStorage.getItem('selectedAppearanceMode')||localStorage.getItem('toojibee-theme')||'system';}catch(e){}return {id:validId(id),appearance:validMode(mode)};}
function apply(id,appearance){
 id=validId(id);appearance=validMode(appearance);var mode=resolve(appearance),root=document.documentElement,v=variables(id,mode);
 Object.keys(v).forEach(function(k){root.style.setProperty(k,v[k]);});root.style.colorScheme=mode;
 root.setAttribute('data-palette',id);root.setAttribute('data-theme',mode);root.setAttribute('data-appearance',appearance);root.removeAttribute('data-accent');
 if(document.querySelectorAll)document.querySelectorAll('[data-theme-logo]').forEach(function(img){img.src=logoUrl(id,mode,img.dataset.themeLogo);});
 try{localStorage.setItem('selectedThemeId',id);localStorage.setItem('selectedAppearanceMode',appearance);localStorage.removeItem('toojibee-palette');localStorage.removeItem('toojibee-theme');localStorage.removeItem('toojibee-accents-v1');}catch(e){}
 var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',tokens(id,mode).background);
 return {id:id,appearance:appearance,mode:mode,background:tokens(id,mode).background};
}
function logoUrl(id,mode,kind){return '../assets/icons/logo-'+validId(id)+'-'+(mode==='light'?'light':'dark')+(kind==='banner'?'-banner':'')+'.svg?v=tj7';}
var api={palettes:palettes,defaultId:defaultId,validId:validId,validMode:validMode,tokens:tokens,variables:variables,contrast:contrast,read:read,apply:apply,resolve:resolve,logoUrl:logoUrl};
global.AppThemes=api;
if(typeof document!=='undefined'){var saved=read();apply(saved.id,saved.appearance);if(document.addEventListener&&document.querySelectorAll)document.addEventListener('DOMContentLoaded',function(){var choice=read();document.querySelectorAll('[data-theme-logo]').forEach(function(img){img.src=logoUrl(choice.id,resolve(choice.appearance),img.dataset.themeLogo);});});var listener=function(){if(document.documentElement.getAttribute('data-appearance')==='system'){if(typeof global.applyAppearance==='function')global.applyAppearance();else apply(read().id,'system');}};if(media){if(media.addEventListener)media.addEventListener('change',listener);else if(media.addListener)media.addListener(listener);}}
})(typeof window!=='undefined'?window:globalThis);
