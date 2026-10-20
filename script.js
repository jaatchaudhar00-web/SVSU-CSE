"use strict";

/*
  SVSU CSE Portal

  Supabase tables:
  notices: id, title, category, content, created_at
  timetable: id, course, semester, day, class_time, subject, faculty, room

  Optional settings table:
  site_settings: key, value

  SECURITY:
  - Admin login uses Supabase Authentication.
  - The admin field must contain the admin's registered Supabase email.
  - Configure Supabase RLS policies before allowing writes.
  - Student login below is a demo profile login, not verified authentication.
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
let siteSettings = {
  portal_name: "SVSU CSE Portal",
  contact_phone: "",
  contact_email: ""
};

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

    const previous = select.value;
    select.innerHTML = "";

    for (let i = 1; i <= 8; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `Semester ${i}`;
      select.appendChild(option);
    }

    if (previous) select.value = previous;
  });
}

function updateRoleForm(role) {
  currentRole = role === "admin" ? "admin" : "student";

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.role === currentRole);
  });

  const isAdmin = currentRole === "admin";

  if ($("identityLabel")) {
    $("identityLabel").textContent =
      isAdmin ? "Admin email" : "Roll number";
  }

  if ($("rollNumber")) {
    $("rollNumber").placeholder =
      isAdmin ? "Enter registered admin email" : "Enter your roll number";

    $("rollNumber").autocomplete = isAdmin ? "username" : "off";
  }

  $("folderGroup")?.classList.toggle("hidden", isAdmin);
  $("courseGroup")?.classList.toggle("hidden", isAdmin);
  $("semesterGroup")?.classList.toggle("hidden", isAdmin);
  $("adminPasswordGroup")?.classList.toggle("hidden", !isAdmin);

  if ($("adminPassword")) {
    $("adminPassword").required = isAdmin;
  }

  if ($("fullName")) {
    $("fullName").required = !isAdmin;
    $("fullName").placeholder = isAdmin
      ? "Admin name (optional)"
      : "Enter your name";
  }

  if ($("loginButton")) {
    $("loginButton").textContent = isAdmin
      ? "Admin Login"
      : "Student Login";
  }
}

function showView(viewName) {
  const allowedViews = [
    "overview", "timetable", "notices", "profile", "admin"
  ];

  if (!allowedViews.includes(viewName)) return;

  if (viewName === "admin" && currentRole !== "admin") {
    toast("Admin access required.");
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
    admin: ["Website control panel", "Admin Control Panel"]
  };

  if (titles[viewName]) {
    if ($("pageTitle")) $("pageTitle").textContent = titles[viewName][0];
    if ($("breadcrumbPage")) {
      $("breadcrumbPage").textContent = titles[viewName][1];
    }
  }

  if (viewName === "admin") renderAdminData();
}

async function signIn(event) {
  event.preventDefault();

  const name = $("fullName")?.value.trim() || "";
  const identity = $("rollNumber")?.value.trim() || "";
  const password = $("adminPassword")?.value || "";

  if (!identity) {
    toast(currentRole === "admin"
      ? "Enter the registered admin email."
      : "Enter your roll number.");
    return;
  }

  if (currentRole === "admin") {
    if (!password) {
      toast("Enter the admin password.");
      return;
    }

    const button = $("loginButton");
    if (button) button.disabled = true;

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: identity,
        password
      });

      if (error) throw error;

      const authUser = data.user;
      if (!authUser) throw new Error("Admin account was not returned.");

      // Do not trust the browser role alone.
      // Admin authorization must also be enforced by Supabase RLS.
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role,full_name")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile || profile.role !== "admin") {
        await supabaseClient.auth.signOut();
        throw new Error(
          "This account is not marked as an admin in the profiles table."
        );
      }

      currentRole = "admin";
      currentUser = {
        id: authUser.id,
        name: profile.full_name || authUser.email || "Admin",
        roll: authUser.email || "",
        folder: "",
        course: "Administration",
        semester: 1,
        role: "admin"
      };

      openDashboard();
      await loadAllData();
    } catch (error) {
      console.error("Admin login error:", error);
      toast(error.message || "Admin login failed. Check your account setup.");
    } finally {
      if (button) button.disabled = false;
    }

    return;
  }

  // Demo-only student profile login.
  // Use real authentication if student data needs to be protected.
  if (!name) {
    toast("Please enter your name.");
    return;
  }

  currentUser = {
    id: null,
    name,
    roll: identity,
    folder: $("folderNumber")?.value.trim() || "",
    course: $("course")?.value || "B.Tech CSE",
    semester: Number($("semester")?.value || 1),
    role: "student"
  };

  currentRole = "student";
  openDashboard();
  await loadAllData();
}

function openDashboard() {
  $("loginPage")?.classList.add("hidden");
  $("dashboardPage")?.classList.remove("hidden");

  const user = currentUser;
  if (!user) return;

  if ($("sidebarName")) $("sidebarName").textContent = user.name;
  if ($("sidebarRole")) $("sidebarRole").textContent = user.role.toUpperCase();
  if ($("sidebarAvatar")) {
    $("sidebarAvatar").textContent = user.name.charAt(0).toUpperCase();
  }

  if ($("welcomeName")) $("welcomeName").textContent = user.name;
  if ($("courseStat")) $("courseStat").textContent = user.course;
  if ($("semesterStat")) {
    $("semesterStat").textContent = `Semester ${user.semester}`;
  }

  if ($("profileName")) $("profileName").textContent = user.name;
  if ($("profileRole")) $("profileRole").textContent = user.role.toUpperCase();
  if ($("profileRoll")) $("profileRoll").textContent = user.roll || "—";
  if ($("profileFolder")) $("profileFolder").textContent = user.folder || "—";
  if ($("profileCourse")) $("profileCourse").textContent = user.course;
  if ($("profileSemester")) {
    $("profileSemester").textContent = `Semester ${user.semester}`;
  }

  $("adminNav")?.classList.toggle("hidden", user.role !== "admin");

  showView("overview");
  renderTimetable();
  renderNotices();
}

async function signOut() {
  if (currentUser?.role === "admin") {
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error("Sign-out error:", error);
  }

  currentUser = null;
  currentRole = "student";

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
    date: row.created_at
      ? new Date(row.created_at).toLocaleString()
      : ""
  };
}

function normaliseClass(row) {
  return {
    id: row.id,
    course: row.course || "B.Tech CSE",
    semester: Number(row.semester || 1),
    day: row.day || "",
    time: row.class_time || "",
    subject: row.subject || "",
    faculty: row.faculty || "",
    room: row.room || ""
  };
}

async function loadAllData() {
  setConnectionStatus("Connecting…");

  await Promise.allSettled([
    loadNotices(),
    loadTimetable(),
    loadSiteSettings()
  ]);

  setConnectionStatus("Supabase connected");
}

async function loadNotices() {
  const { data, error } = await supabaseClient
    .from("notices")
    .select("id,title,category,content,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Notices load error:", error);
    setConnectionStatus("Notices unavailable");
    toast("Notices could not load. Check Supabase connection and policies.");
    return;
  }

  notices = (data || []).map(normaliseNotice);
  renderNotices();
  renderAdminData();
}

async function loadTimetable() {
  const { data, error } = await supabaseClient
    .from("timetable")
    .select("id,course,semester,day,class_time,subject,faculty,room");

  if (error) {
    console.error("Timetable load error:", error);
    setConnectionStatus("Timetable unavailable");
    toast("Timetable could not load. Check Supabase connection and policies.");
    return;
  }

  const dayOrder = new Map(days.map((day, index) => [day, index]));

  timetable = (data || [])
    .map(normaliseClass)
    .sort((a, b) =>
      (dayOrder.get(a.day) ?? 99) - (dayOrder.get(b.day) ?? 99) ||
      a.time.localeCompare(b.time)
    );

  renderTimetable();
  renderAdminData();
}

function renderNotices() {
  const list = $("noticeList");
  const recent = $("recentNotices");

  const html = notices.length
    ? notices.map((notice) => `
        <article class="notice-item">
          <div>
            <span class="notice-category">${escapeHTML(notice.category)}</span>
            <h3>${escapeHTML(notice.title)}</h3>
            <p>${escapeHTML(notice.text)}</p>
            <small>${escapeHTML(notice.date)}</small>
          </div>
        </article>
      `).join("")
    : "<p>No notices have been published yet.</p>";

  if (list) list.innerHTML = html;

  if (recent) {
    recent.innerHTML = notices.length
      ? notices.slice(0, 3).map((notice) => `
          <article class="notice-item">
            <div>
              <span class="notice-category">${escapeHTML(notice.category)}</span>
              <h3>${escapeHTML(notice.title)}</h3>
              <p>${escapeHTML(notice.text)}</p>
            </div>
          </article>
        `).join("")
      : "<p>No recent notices.</p>";
  }
}

function renderTimetable() {
  const body = $("timetableBody");
  if (!body) return;

  const course = $("ttCourse")?.value || "All";
  const semester = Number($("ttSemester")?.value || 1);
  const day = $("dayFilter")?.value || "All";

  const filtered = timetable.filter((item) =>
    (course === "All" || item.course === course) &&
    item.semester === semester &&
    (day === "All" || item.day === day)
  );

  if (!filtered.length) {
    body.innerHTML = `
      <tr><td colspan="5">No timetable entries found for these filters.</td></tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((item) => `
    <tr>
      <td>${escapeHTML(item.day)}</td>
      <td>${escapeHTML(item.time)}</td>
      <td>${escapeHTML(item.subject)}</td>
      <td>${escapeHTML(item.faculty || "—")}</td>
      <td>${escapeHTML(item.room || "—")}</td>
    </tr>
  `).join("");
}

function renderAdminData() {
  const container = $("adminData");
  if (!container || currentRole !== "admin") return;

  const noticeHTML = notices.map((notice) => `
    <article class="admin-data-item">
      <div>
        <strong>${escapeHTML(notice.title)}</strong>
        <p>${escapeHTML(notice.category)} · ${escapeHTML(notice.date)}</p>
      </div>
      <button type="button" class="secondary-btn"
        data-delete-notice="${escapeHTML(notice.id)}">
        Delete
      </button>
    </article>
  `).join("");

  const classHTML = timetable.map((item) => `
    <article class="admin-data-item">
      <div>
        <strong>${escapeHTML(item.subject)}</strong>
        <p>${escapeHTML(item.course)} · Semester ${item.semester} ·
          ${escapeHTML(item.day)} · ${escapeHTML(item.time)}</p>
        <p>${escapeHTML(item.faculty)} · ${escapeHTML(item.room)}</p>
      </div>
      <button type="button" class="secondary-btn"
        data-delete-class="${escapeHTML(item.id)}">
        Delete
      </button>
    </article>
  `).join("");

  container.innerHTML = `
    <h3>Notices</h3>
    ${noticeHTML || "<p>No notices to display.</p>"}
    <hr>
    <h3>Timetable classes</h3>
    ${classHTML || "<p>No classes to display.</p>"}
  `;
}

function requireAdmin() {
  if (!currentUser || currentUser.role !== "admin") {
    toast("Only an authenticated admin can make changes.");
    return false;
  }
  return true;
}

async function addNotice(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const title = $("noticeTitle")?.value.trim() || "";
  const category = $("noticeCategory")?.value || "General";
  const content = $("noticeContent")?.value.trim() || "";

  if (!title || !content) {
    toast("Enter a notice title and content.");
    return;
  }

  const { error } = await supabaseClient
    .from("notices")
    .insert({ title, category, content });

  if (error) {
    console.error("Add notice error:", error);
    toast("Notice was not saved. Check the notices INSERT policy.");
    return;
  }

  $("addNoticeForm")?.reset();
  await loadNotices();
  toast("Notice published successfully.");
}

async function addClass(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const row = {
    course: $("adminCourse")?.value || "B.Tech CSE",
    semester: Number($("adminSemester")?.value || 1),
    day: $("adminDay")?.value || "Monday",
    class_time: $("classTime")?.value.trim() || "",
    subject: $("subject")?.value.trim() || "",
    faculty: $("faculty")?.value.trim() || "",
    room: $("room")?.value.trim() || ""
  };

  if (!row.class_time || !row.subject) {
    toast("Enter the class time and subject.");
    return;
  }

  const { error } = await supabaseClient
    .from("timetable")
    .insert(row);

  if (error) {
    console.error("Add class error:", error);
    toast("Class was not saved. Check the timetable INSERT policy.");
    return;
  }

  $("addClassForm")?.reset();
  fillSemesters();
  await loadTimetable();
  toast("Class added successfully.");
}

async function deleteNotice(id) {
  if (!requireAdmin()) return;
  if (!confirm("Delete this notice?")) return;

  const { error } = await supabaseClient
    .from("notices")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete notice error:", error);
    toast("Could not delete notice. Check the DELETE policy.");
    return;
  }

  await loadNotices();
  toast("Notice deleted.");
}

async function deleteClass(id) {
  if (!requireAdmin()) return;
  if (!confirm("Delete this timetable class?")) return;

  const { error } = await supabaseClient
    .from("timetable")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete class error:", error);
    toast("Could not delete class. Check the DELETE policy.");
    return;
  }

  await loadTimetable();
  toast("Class deleted.");
}

async function loadSiteSettings() {
  /*
    This requires a site_settings table with columns:
    key (text, primary key), value (text).
    If that table doesn't exist yet, the default values remain active.
  */
  const { data, error } = await supabaseClient
    .from("site_settings")
    .select("key,value");

  if (error) {
    console.info("Site settings table not configured yet:", error.message);
    return;
  }

  for (const row of data || []) {
    if (Object.prototype.hasOwnProperty.call(siteSettings, row.key)) {
      siteSettings[row.key] = row.value || "";
    }
  }

  applySiteSettings();
}

function applySiteSettings() {
  if ($("portalTitle")) {
    $("portalTitle").textContent =
      siteSettings.portal_name || "SVSU CSE Portal";
  }

  if ($("settingPortalName")) {
    $("settingPortalName").value = siteSettings.portal_name || "";
  }
  if ($("settingPhone")) {
    $("settingPhone").value = siteSettings.contact_phone || "";
  }
  if ($("settingEmail")) {
    $("settingEmail").value = siteSettings.contact_email || "";
  }

  document.title = siteSettings.portal_name || "SVSU CSE Portal";
}

async function saveSiteSettings() {
  if (!requireAdmin()) return;

  const updates = {
    portal_name: $("settingPortalName")?.value.trim() || "SVSU CSE Portal",
    contact_phone: $("settingPhone")?.value.trim() || "",
    contact_email: $("settingEmail")?.value.trim() || ""
  };

  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value
  }));

  const { error } = await supabaseClient
    .from("site_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    console.error("Save settings error:", error);
    toast("Settings not saved. Create site_settings and configure its RLS policies.");
    return;
  }

  siteSettings = updates;
  applySiteSettings();
  toast("Website settings saved.");
}

function init() {
  fillSemesters();
  updateRoleForm("student");

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => updateRoleForm(tab.dataset.role));
  });

  $("loginForm")?.addEventListener("submit", signIn);
  $("logoutButton")?.addEventListener("click", signOut);
  $("addNoticeForm")?.addEventListener("submit", addNotice);
  $("addClassForm")?.addEventListener("submit", addClass);
  $("saveSettingsButton")?.addEventListener("click", saveSiteSettings);

  ["ttCourse", "ttSemester", "dayFilter"].forEach((id) => {
    $(id)?.addEventListener("change", renderTimetable);
  });

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      showView(viewButton.dataset.view);
      return;
    }

    const noticeButton = event.target.closest("[data-delete-notice]");
    if (noticeButton) {
      deleteNotice(noticeButton.dataset.deleteNotice);
      return;
    }

    const classButton = event.target.closest("[data-delete-class]");
    if (classButton) {
      deleteClass(classButton.dataset.deleteClass);
    }
  });

  loadAllData();
}

document.addEventListener("DOMContentLoaded", init);