"use strict";

/*
  SVSU CSE Portal
  Supabase tables expected:
  notices: id, title, category, content, created_at
  timetable: id, course, semester, day, class_time, subject, faculty, room

  Requires supabase-config.js to define:
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
*/

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

let currentRole = "student";
let currentUser = null;
let notices = [];
let timetable = [];
let selectedDay = "All";

const days = [
  "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toast(message) {
  const el = $("toast");
  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function setConnectionStatus(message) {
  if ($("connectionLabel")) {
    $("connectionLabel").textContent = message;
  }
}

function fillSemesters() {
  ["semester", "ttSemester", "adminSemester"].forEach((id) => {
    const select = $(id);
    if (!select) return;

    select.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `Semester ${i}`;
      select.appendChild(option);
    }
  });
}

function updateRoleForm(role) {
  currentRole = role;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.role === role);
  });

  const student = role === "student";
  const teacher = role === "teacher";
  const admin = role === "admin";

  if ($("identityLabel")) {
    $("identityLabel").textContent =
      admin ? "Admin username" : teacher ? "Teacher username / staff ID" : "Roll number";
  }

  if ($("rollNumber")) {
    $("rollNumber").placeholder =
      admin ? "Enter admin username" :
      teacher ? "Enter teacher username" : "Enter your roll number";
  }

  $("folderGroup")?.classList.toggle("hidden", !student);
  $("courseGroup")?.classList.toggle("hidden", !student);
  $("semesterGroup")?.classList.toggle("hidden", !student);
  $("adminPasswordGroup")?.classList.toggle("hidden", !admin);
  $("teacherApplyPrompt")?.classList.toggle("hidden", !teacher);
}

function showView(viewName) {
  const allowedViews = [
    "overview", "timetable", "notices",
    "profile", "teacherApply", "admin"
  ];

  if (!allowedViews.includes(viewName)) return;

  if (viewName === "admin" && currentRole !== "admin") {
    toast("Admin access required.");
    return;
  }

  if (viewName === "teacherApply" &&
      currentRole !== "teacher" &&
      currentRole !== "student") {
    toast("This section is not available for this account.");
    return;
  }

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.add("hidden");
  });

  $(`${viewName}View`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === viewName);
  });

  const titles = {
    overview: ["Department overview", "Overview"],
    timetable: ["Class timetable", "Timetable"],
    notices: ["Notices & events", "Notices & Events"],
    profile: ["My profile", "My Profile"],
    teacherApply: ["Teacher access application", "Teacher Application"],
    admin: ["Manage portal", "Manage Portal"]
  };

  if (titles[viewName]) {
    $("pageTitle").textContent = titles[viewName][0];
    $("breadcrumbPage").textContent = titles[viewName][1];
  }

  if (viewName === "admin") renderAdminData();
}

function signIn(event) {
  event.preventDefault();

  const name = $("fullName")?.value.trim() || "";
  const identity = $("rollNumber")?.value.trim() || "";
  const password = $("adminPassword")?.value || "";

  if (!name || !identity) {
    toast("Please complete the required fields.");
    return;
  }

  if (currentRole === "admin") {
    toast(
      "Admin login is not connected to secure Supabase Authentication yet. " +
      "Do not use a hardcoded password for a public website."
    );
    return;
  }

  if (currentRole === "teacher") {
    toast(
      "Teacher login requires a registered and approved Supabase account. " +
      "Authentication has not been configured yet."
    );
    return;
  }

  currentUser = {
    name,
    roll: identity,
    folder: $("folderNumber")?.value.trim() || "",
    course: $("course")?.value || "B.Tech CSE",
    semester: Number($("semester")?.value || 1),
    role: "student"
  };

  openDashboard();
}

function openDashboard() {
  $("loginPage")?.classList.add("hidden");
  $("dashboardPage")?.classList.remove("hidden");

  const user = currentUser;
  if (!user) return;

  $("sidebarName").textContent = user.name;
  $("sidebarRole").textContent = user.role.toUpperCase();
  $("sidebarAvatar").textContent = user.name.charAt(0).toUpperCase();
  $("welcomeName").textContent = user.name;
  $("courseStat").textContent = user.course;
  $("semesterStat").textContent = `Semester ${user.semester}`;
  $("profileName").textContent = user.name;
  $("profileRole").textContent = user.role.toUpperCase();
  $("profileRoll").textContent = user.roll;
  $("profileFolder").textContent = user.folder || "—";
  $("profileCourse").textContent = user.course;
  $("profileSemester").textContent = `Semester ${user.semester}`;

  $("adminNav")?.classList.toggle("hidden", user.role !== "admin");
  $("teacherApplyNav")?.classList.toggle("hidden", user.role !== "student");

  showView("overview");
  renderTimetable();
  renderNotices();
}

function signOut() {
  currentUser = null;
  $("dashboardPage")?.classList.add("hidden");
  $("loginPage")?.classList.remove("hidden");
  $("loginForm")?.reset();
  updateRoleForm("student");
}

function normaliseNotice(row) {
  return {
    id: row.id,
    title: row.title || "Untitled notice",
    category: row.category || "General",
    text: row.content || "",
    date: row.created_at ? new Date(row.created_at).toLocaleString() : "",
    effective: "",
    photo: ""
  };
}

function normaliseClass(row) {
  return {
    id: row.id,
    course: row.course,
    semester: Number(row.semester),
    day: row.day,
    time: row.class_time || "",
    subject: row.subject || "",
    faculty: row.faculty || "",
    room: row.room || ""
  };
}

async function loadNotices() {
  const { data, error } = await supabaseClient
    .from("notices")
    .select("id,title,category,content,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Notices load error:", error);
    toast("Notices could not load. Check Supabase policies and connection.");
    return;
  }

  notices = (data || []).map(normaliseNotice);
  renderNotices();
}

async function loadTimetable() {
  const { data, error } = await supabaseClient
    .from("timetable")
    .select("id,course,semester,day,class_time,subject,faculty,room")
    .order("day")
    .order("class_time");

  if (error) {
    console.error("Timetable load error:", error);
    toast("Timetable could not load. Check Supabase policies and connection.");
    return;
  }

  timetable = (data || []).map(normaliseClass);
  renderTimetable();
}

function renderNotices() {
  const all = $("allNotices");
  const latest = $("latestNotices");

  if ($("noticeCount")) $("noticeCount").textContent = notices.length;
  if ($("noticeStat")) $("noticeStat").textContent = notices.length;

  if (all) {
    all.innerHTML = notices.length
      ? notices.map((notice) => `
          <article class="notice-card">
            <span class="notice-type">${escapeHTML(notice.category)}</span>
            <h3>${escapeHTML(notice.title)}</h3>
            <p>${escapeHTML(notice.text)}</p>
            <div class="notice-date">${escapeHTML(notice.date)}</div>
          </article>
        `).join("")
      : `<p class="empty-state">No notices have been published yet.</p>`;
  }

  if (latest) {
    latest.innerHTML = notices.slice(0, 4).map((notice) => `
      <div class="notice-item">
        <div class="notice-symbol">◉</div>
        <div>
          <div class="notice-title">${escapeHTML(notice.title)}</div>
          <div class="notice-date">${escapeHTML(notice.category)} · ${escapeHTML(notice.date)}</div>
        </div>
      </div>
    `).join("") || `<p class="muted">No recent notices.</p>`;
  }
}

function renderTimetable() {
  const body = $("timetableBody");
  if (!body) return;

  const course = $("ttCourse")?.value || currentUser?.course || "B.Tech CSE";
  const semester = Number($("ttSemester")?.value || currentUser?.semester || 1);
  const day = $("ttDay")?.value || "All";

  const filtered = timetable.filter((item) =>
    item.course === course &&
    item.semester === semester &&
    (day === "All" || item.day === day)
  );

  body.innerHTML = filtered.map((item) => `
    <tr>
      <td>${escapeHTML(item.day)}</td>
      <td>${escapeHTML(item.time)}</td>
      <td><span class="subject-chip">${escapeHTML(item.subject)}</span></td>
      <td>${escapeHTML(item.faculty)}</td>
      <td>${escapeHTML(item.room)}</td>
    </tr>
  `).join("");

  $("emptyTimetable")?.classList.toggle("hidden", filtered.length > 0);

  if ($("classStat")) {
    $("classStat").textContent = filtered.length;
  }

  if ($("ttSummary")) {
    $("ttSummary").textContent =
      `${filtered.length} entries · ${course} · Semester ${semester}`;
  }

  const schedule = $("todaySchedule");
  if (schedule) {
    const preview = filtered.slice(0, 4);
    schedule.innerHTML = preview.map((item) => `
      <div class="schedule-item">
        <div class="schedule-time">${escapeHTML(item.time)}</div>
        <div class="schedule-line"></div>
        <div>
          <div class="schedule-subject">${escapeHTML(item.subject)}</div>
          <div class="schedule-detail">
            ${escapeHTML(item.day)} · ${escapeHTML(item.faculty)} · ${escapeHTML(item.room)}
          </div>
        </div>
      </div>
    `).join("") || `<p class="muted">No matching timetable entries.</p>`;
  }
}

function renderAdminData() {
  const dataList = $("adminDataList");
  if (!dataList) return;

  const classRows = timetable.map((item) => `
    <div class="admin-row">
      <div>
        <strong>${escapeHTML(item.subject)}</strong>
        <p>${escapeHTML(item.course)} · Semester ${item.semester} · ${escapeHTML(item.day)} · ${escapeHTML(item.time)}</p>
      </div>
      <span class="status-pill">Timetable</span>
    </div>
  `);

  const noticeRows = notices.map((item) => `
    <div class="admin-row">
      <div>
        <strong>${escapeHTML(item.title)}</strong>
        <p>${escapeHTML(item.category)} · ${escapeHTML(item.date)}</p>
      </div>
      <span class="status-pill">Notice</span>
    </div>
  `);

  dataList.innerHTML = [...classRows, ...noticeRows].join("") ||
    `<p class="empty-state">No published data found.</p>`;
}

/*
  These functions send INSERT requests to Supabase.
  They will work only after secure, appropriate write permissions
  have been configured in Supabase.
*/

async function addClass(event) {
  event.preventDefault();

  if (currentRole !== "admin") {
    toast("Only an authenticated administrator can add timetable entries.");
    return;
  }

  const row = {
    course: $("adminCourse").value,
    semester: Number($("adminSemester").value),
    day: $("adminDay").value,
    class_time: $("adminTime").value.trim(),
    subject: $("adminSubject").value.trim(),
    faculty: $("adminFaculty").value.trim(),
    room: $("adminRoom").value.trim()
  };

  const { error } = await supabaseClient.from("timetable").insert(row);

  if (error) {
    console.error(error);
    toast("Save failed. Supabase write permission or admin authentication is missing.");
    return;
  }

  $("addClassForm").reset();
  await loadTimetable();
  toast("Timetable entry saved.");
}

async function addNotice(event) {
  event.preventDefault();

  if (currentRole !== "admin") {
    toast("Only an authenticated administrator can publish notices.");
    return;
  }

  const row = {
    title: $("noticeTitle").value.trim(),
    category: $("noticeCategory").value,
    content: $("noticeText").value.trim()
  };

  const { error } = await supabaseClient.from("notices").insert(row);

  if (error) {
    console.error(error);
    toast("Publish failed. Supabase write permission or admin authentication is missing.");
    return;
  }

  $("addNoticeForm").reset();
  await loadNotices();
  toast("Notice published.");
}

function showTeacherApplication() {
  if (currentUser) {
    showView("teacherApply");
  } else {
    $("applicationModal")?.classList.remove("hidden");
  }
}

function init() {
  fillSemesters();

  if ($("todayDate")) {
    $("todayDate").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => updateRoleForm(tab.dataset.role));
  });

  $("loginForm")?.addEventListener("submit", signIn);
  $("logoutBtn")?.addEventListener("click", signOut);
  $("addClassForm")?.addEventListener("submit", addClass);
  $("addNoticeForm")?.addEventListener("submit", addNotice);

  document.querySelectorAll(".nav-link[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });

  ["ttCourse", "ttSemester", "ttDay"].forEach((id) => {
    $(id)?.addEventListener("change", renderTimetable);
  });

  $("printBtn")?.addEventListener("click", () => window.print());

  $("showTeacherApplication")?.addEventListener("click", showTeacherApplication);
  $("closeApplicationModal")?.addEventListener("click", () => {
    $("applicationModal")?.classList.add("hidden");
  });
  $("modalGoApply")?.addEventListener("click", () => {
    $("applicationModal")?.classList.add("hidden");
    toast("Teacher application submission requires a configured backend.");
  });

  $("enableAlertsBtn")?.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      toast("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    $("alertStatus").textContent =
      permission === "granted"
        ? "Browser notifications enabled."
        : "Notifications were not enabled.";
  });

  $("resetDemoBtn")?.addEventListener("click", () => {
    toast("Remote data was not deleted. Configure a secure admin delete action first.");
  });

  updateRoleForm("student");
  setConnectionStatus("Connecting…");

  Promise.all([loadNotices(), loadTimetable()])
    .then(() => setConnectionStatus("Supabase connected"))
    .catch((error) => {
      console.error("Portal initialisation error:", error);
      setConnectionStatus("Connection error");
    });
}

document.addEventListener("DOMContentLoaded", init);