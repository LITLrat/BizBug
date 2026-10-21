/* Install: <script src="https://YOUR-DOMAIN/widget.js" data-business="bloom" async></script> */
(()=>{'use strict';const me=document.currentScript;if(!me)return;const base=new URL(me.src).origin;
 const business=me.getAttribute('data-business')||'bloom';
 const launcher=document.createElement('button');launcher.type='button';launcher.setAttribute('aria-label','Open business assistant');
 Object.assign(launcher.style,{position:'fixed',right:'20px',bottom:'20px',border:'0',width:'58px',height:'58px',borderRadius:'18px',background:'#28594b',color:'white',fontSize:'28px',boxShadow:'0 14px 40px #163f3663',cursor:'pointer',zIndex:'2147483000'});
 launcher.textContent='✳';
 const frame=document.createElement('iframe');frame.title='Business virtual assistant';frame.src=base+'/widget?business='+encodeURIComponent(business);frame.setAttribute('loading','lazy');
 Object.assign(frame.style,{position:'fixed',bottom:'89px',right:'20px',width:'min(385px,calc(100vw - 32px))',height:'min(575px,calc(100vh - 105px))',border:'1px solid #e1e9e4',borderRadius:'16px',boxShadow:'0 20px 65px #11372f52',zIndex:'2147483000',background:'white',display:'none'});
 launcher.addEventListener('click',()=>{const open=frame.style.display==='none';frame.style.display=open?'block':'none';launcher.textContent=open?'×':'✳';});
 document.body.append(frame,launcher);
})();
