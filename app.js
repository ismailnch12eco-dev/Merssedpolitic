/* إعداد الاتصال: ضع بيانات مشروع Supabase في ملف config.js كما هو موضح في README_AR.md */
const CONFIG = window.APP_CONFIG || {};
const hasConfig = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
const client = hasConfig ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
const $ = (id) => document.getElementById(id);
const form = $("bookingForm"), message = $("formMessage"), setupNotice = $("setupNotice");
const modal = $("adminModal");
const statusLabels = {pending:"قيد المراجعة",approved:"مقبول",rejected:"مرفوض",completed:"مكتمل"};
const statusClasses = {pending:"",approved:"status-approved",rejected:"status-rejected",completed:"status-completed"};
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showNotice(el, text, error=false){el.textContent=text;el.classList.remove("hidden","notice-error");if(error)el.classList.add("notice-error");}
function hide(el){el.classList.add("hidden");}
function localToday(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
form.elements.appointment_date.min=localToday();
const timeSelect=form.elements.appointment_time;
for(let h=8;h<=20;h++){for(const m of [0,30]){if(h===20&&m===30)continue;const t=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;const o=document.createElement("option");o.value=t;o.textContent=t;timeSelect.appendChild(o)}}
if(!hasConfig) setupNotice.classList.remove("hidden");
form.addEventListener("submit", async e=>{
 e.preventDefault(); hide(message);
 if(!client){showNotice(message,"لم يتم تفعيل الحجز بعد. أكمل إعداد Supabase أولًا؛ لن تُحفظ هذه البيانات في وضع المعاينة.",true);return;}
 const data=Object.fromEntries(new FormData(form).entries());
 if(data.appointment_date<localToday()){showNotice(message,"يرجى اختيار تاريخ اليوم أو تاريخ لاحق.",true);return;}
 $("submitBtn").disabled=true;$("submitBtn").textContent="جارٍ إرسال الطلب...";
 try{
   const {error}=await client.from("appointments").insert({...data,status:"pending"});
   if(error) throw error;
   form.reset();showNotice(message,"تم إرسال طلبك بنجاح. الطلب قيد المراجعة، ويمكنك متابعة حالته باستخدام رقم الهاتف.");
 }catch(err){showNotice(message,err.message?.includes("duplicate")?"هذا الموعد غير متاح أو تم حجزه. اختر وقتًا آخر.":"تعذر إرسال الطلب. تحقق من البيانات أو حاول لاحقًا.",true);}
 finally{$("submitBtn").disabled=false;$("submitBtn").innerHTML='إرسال طلب الموعد <span>←</span>';}
});
$("lookupForm").addEventListener("submit",async e=>{
 e.preventDefault();const out=$("lookupResults");out.innerHTML="";
 if(!client){out.textContent="فعّل قاعدة البيانات لعرض الطلبات.";return;}
 const phone=new FormData(e.currentTarget).get("phone").trim();
 out.textContent="جارٍ البحث...";
 try{
  // Public lookup is handled by a restricted database function, not by exposing the appointments table.
  const {data,error}=await client.rpc("lookup_my_appointments",{p_phone:phone});
  if(error)throw error;
  out.innerHTML=data?.length?data.map(a=>`<div class="lookup-item"><strong>${esc(a.activity_type)} — ${esc(a.appointment_date)} ${esc(a.appointment_time)}</strong><p>${esc(a.location)}</p><span class="status-pill ${statusClasses[a.status]||""}">${esc(statusLabels[a.status]||a.status)}</span></div>`).join(""):'لا توجد طلبات مرتبطة بهذا الرقم.';
 }catch(err){out.textContent="تعذر عرض الحالة. تأكد من إعداد دالة متابعة الطلبات في ملف schema.sql.";}
});
$("adminOpen").addEventListener("click",()=>{modal.classList.remove("hidden");syncAuthView()});
$("adminClose").addEventListener("click",()=>modal.classList.add("hidden"));
modal.addEventListener("click",e=>{if(e.target.dataset.close)modal.classList.add("hidden")});
document.addEventListener("keydown",e=>{if(e.key==="Escape")modal.classList.add("hidden")});
async function syncAuthView(){
 if(!client){$("loginView").classList.remove("hidden");$("dashboardView").classList.add("hidden");showNotice($("loginMessage"),"يلزم إعداد Supabase قبل تسجيل الدخول.",true);return;}
 const {data:{session}}=await client.auth.getSession();
 $("loginView").classList.toggle("hidden",Boolean(session));$("dashboardView").classList.toggle("hidden",!session);
 if(session)loadAppointments();
}
$("loginForm").addEventListener("submit",async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());
 const {error}=await client.auth.signInWithPassword({email:data.email,password:data.password});
 if(error){showNotice($("loginMessage"),"تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.",true);return;}
 hide($("loginMessage"));syncAuthView();
});
$("logoutBtn").addEventListener("click",async()=>{await client.auth.signOut();syncAuthView()});
$("refreshBtn").addEventListener("click",loadAppointments);
$("statusFilter").addEventListener("change",loadAppointments);
async function loadAppointments(){
 const list=$("appointmentsList");list.innerHTML='<div class="empty-state">جارٍ تحميل الطلبات...</div>';
 const filter=$("statusFilter").value;
 let q=client.from("appointments").select("*").order("appointment_date",{ascending:true}).order("appointment_time",{ascending:true});
 if(filter!=="all")q=q.eq("status",filter);
 const {data,error}=await q;
 if(error){list.innerHTML='<div class="empty-state">لا يمكن عرض الطلبات. تأكد أن حسابك مضاف كمسؤول وأن سياسات قاعدة البيانات مفعّلة.</div>';return;}
 if(!data?.length){list.innerHTML='<div class="empty-state">لا توجد طلبات في هذا العرض.</div>';return;}
 list.innerHTML=data.map(a=>`<article class="appointment-card"><div class="appointment-top"><div><h4>${esc(a.full_name)} — ${esc(a.activity_type)}</h4><p>${esc(a.appointment_date)} • ${esc(a.appointment_time)} • ${esc(a.location)}</p></div><span class="status-pill ${statusClasses[a.status]||""}">${esc(statusLabels[a.status]||a.status)}</span></div><p>الهاتف: ${esc(a.phone)} ${a.email?` • البريد: ${esc(a.email)}`:""}</p><p>الصفة: ${esc(a.requester_type||"—")}</p><p>${esc(a.details||"لا توجد تفاصيل إضافية")}</p><div class="appointment-actions"><button class="button button-secondary" data-status="approved" data-id="${a.id}">قبول الموعد</button><button class="button button-ghost" data-status="rejected" data-id="${a.id}">رفض</button><button class="button button-ghost" data-status="completed" data-id="${a.id}">تمت التغطية</button><button class="button button-ghost" data-status="pending" data-id="${a.id}">إعادة للمراجعة</button></div></article>`).join("");
}
$("appointmentsList").addEventListener("click",async e=>{
 const b=e.target.closest("button[data-status]");if(!b)return;
 b.disabled=true;
 const {error}=await client.from("appointments").update({status:b.dataset.status}).eq("id",b.dataset.id);
 if(error)showNotice($("adminMessage"),"تعذر تعديل الحالة. تأكد من صلاحيات المسؤول.",true);
 else {showNotice($("adminMessage"),"تم تحديث حالة الطلب. إشعار البريد يحتاج إلى إعداد خدمة إرسال منفصلة.");loadAppointments();}
 b.disabled=false;
});
if(client){client.auth.onAuthStateChange(()=>syncAuthView());}
