"use strict";

// SVSU CSE Portal — Frontend Demo
// Demo data is stored in this browser only.
// Real authentication and shared data require a backend.

const $ = id => document.getElementById(id);

const STORAGE_KEY = "svsuCSEPortal_v3";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "SVSUdemo123";

const courses = {
  "B.Tech CSE": 8,
  "Diploma CSE": 6
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const subjectNames = [
  "Programming Fundamentals",
  "Mathematics",
  "Computer Fundamentals",
  "Digital Electronics",
  "Practical / Lab"
];

let currentRole = "student";
let currentUser = null;
let activeView = "overview";
let teacherPhotoData = "";
let noticePhotoData = "";
let toastTimer = null;
let audioContext = null;

function demoTimetable() {
  const rows = [];

  Object.entries(courses).forEach(([course, total]) => {
    for (let semester = 1; semester <= total; semester++) {
      days.slice(0, 5).forEach((day, index) => {
        const subjectIndex = (index + semester - 1) % subjectNames.length;

        rows.push({
          id: `demo-${course}-${semester}-${day}`,
          course,
          semester,
          day,
          time: [
            "09:00 - 10:00",
            "10:00 - 11:00",
            "11:15 - 12:15",
            "12:15 - 13:15",
            "14:00 - 16:00"
          ][subjectIndex],
          subject: subjectNames[subjectIndex],
          faculty: `Faculty ${String.fromCharCode(65 + subjectIndex)}`,
          room: subjectIndex === 4 ? "Computer Lab" : `Room ${201 + subjectIndex}`,
          demo: true
        });
      });
    }
  });

  return rows;
}

function defaultState() {
  return {
    timetable: demoTimetable(),
    notices: [
      {
        id: 1,
        title: "Welcome to SVSU CSE Portal",
        category: "General",
        text: "Welcome to the Computer Science and Engineering department portal.",
        date: new Date().toLocaleDateString("en-IN"),
        effective: "",
        photo: "",
        sound: false,
        demo: true
      }
    ],
    applications: [],
    approvedTeachers: []
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (
        parsed &&
        Array.isArray(parsed.timetable) &&
        Array.isArray(parsed.notices) &&
        Array.isArray(parsed.applications)
      ) {
        if (!Array.isArray(parsed.approvedTeachers)) {
          parsed.approvedTeachers = [];
        }

        return parsed;
      }
    }
  } catch (error) {
    console.warn("Could not load saved portal data.", error);
  }

  return defaultState();
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    toast("Storage full. Try using a smaller photo.");
  }
}

function toast(message) {
  const element = $("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 3200);
}

function fillSemesters(select, course, selected = 1) {
  if (!select) return;

  select.replaceChildren();

  for (let i = 1; i <= (courses[course] || 8); i++) {
    const option = document.createElement("option");

    option.value = String(i);
    option.textContent = `Semester ${i}`;
    option.selected = i === Number(selected);

    select.appendChild(option);
  }
}

function safeText(element, value) {
  if (element) element.textContent = value ?? "";
}

function switchLoginRole(role) {
  currentRole = role;

  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.role === role);
  });

  const student = role === "student";
  const teacher = role === "teacher";
  const admin = role === "admin";

  $("folderGroup").classList.toggle("hidden", !student);
  $("courseGroup").classList.toggle("hidden", !student);
  $("semesterGroup").classList.toggle("hidden", !student);
  $("adminPasswordGroup").classList.toggle("hidden", !admin);
  $("teacherApplyPrompt").classList.toggle("hidden", !teacher);

  $("fullName").required = student;
  $("rollNumber").required = true;
  $("folderNumber").required = student;
  $("adminPassword").required = admin;

  $("identityLabel").textContent = admin
    ? "Admin username"
    : teacher
      ? "Teacher username / staff ID"
      : "Roll number";

  $("fullName").placeholder = admin
    ? "Admin display name"
    : teacher
      ? "Enter your registered name"
      : "Enter your full name";

  $("rollNumber").placeholder = admin
    ? "admin"
    : teacher
      ? "Enter registered staff ID"
      : "Enter your roll number";

  $("loginSubmit").innerHTML = teacher
    ? "Sign in / check application <span>→</span>"
    : "Continue <span>→</span>";
}

function openDashboard(user) {
  currentUser = user;

  $("loginPage").classList.add("hidden");
  $("dashboardPage").classList.remove("hidden");

  $("adminNav").classList.toggle("hidden", user.role !== "admin");

  $("teacherApplyNav").classList.toggle(
    "hidden",
    user.role === "admin"
  );

  $("avatarBtn").classList.remove("hidden");

  safeText($("connectionLabel"), "Local demo");

  showView("overview");
  renderAll();

  toast(`Welcome, ${user.name}!`);
}

function handleLogin(event) {
  event.preventDefault();

  const name = $("fullName").value.trim();
  const identity = $("rollNumber").value.trim();

  if (!identity) {
    toast("Please enter your username or roll number.");
    return;
  }

  if (currentRole === "admin") {
    if (
      identity.toLowerCase() !== ADMIN_USERNAME ||
      $("adminPassword").value !== ADMIN_PASSWORD
    ) {
      toast("Demo admin login: username admin, password SVSUdemo123.");
      return;
    }

    openDashboard({
      name: name || "Main Admin",
      roll: identity,
      folder: "Administrator",
      course: "Administration",
      semester: 0,
      role: "admin"
    });

    return;
  }

  if (currentRole === "student") {
    const folder = $("folderNumber").value.trim();

    if (!name || !folder) {
      toast("Please fill in your name and folder number.");
      return;
    }

    openDashboard({
      name,
      roll: identity,
      folder,
      course: $("course").value,
      semester: Number($("semester").value),
      role: "student"
    });

    return;
  }

  const username = identity.toLowerCase();

  const approved = state.approvedTeachers.find(
    teacher => teacher.username.toLowerCase() === username
  );

  if (approved) {
    openDashboard({
      name: approved.name,
      roll: approved.username,
      folder: "Teacher",
      course: "Teaching Staff",
      semester: 0,
      role: "teacher",
      assignments: approved.assignments || [],
      photo: approved.photo || ""
    });

    return;
  }

  const application = state.applications.find(
    item => item.username.toLowerCase() === username
  );

  if (application) {
    toast(
      application.status === "rejected"
        ? "Your application was rejected. Contact Main Admin."
        : "Your application is waiting for Main Admin approval."
    );

    return;
  }

  toast("Teacher account not found. Please submit an application first.");
}

function showView(view) {
  const allowedViews = [
    "overview",
    "timetable",
    "notices",
    "profile",
    "admin",
    "teacherApply"
  ];

  if (!allowedViews.includes(view)) return;

  if (!currentUser) return;

  if (view === "admin" && currentUser.role !== "admin") {
    toast("Main Admin access required.");
    return;
  }

  activeView = view;

  document.querySelectorAll(".view").forEach(section => {
    section.classList.add("hidden");
  });

  const target = $(`${view}View`);

  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  const labels = {
    overview: ["Department overview", "Overview"],
    timetable: ["Class timetable", "Timetable"],
    notices: ["Notices & events", "Notices & Events"],
    profile: ["My profile", "My Profile"],
    admin: ["Manage portal", "Manage Portal"],
    teacherApply: ["Teacher application", "Teacher Application"]
  };

  safeText($("pageTitle"), labels[view][0]);
  safeText($("breadcrumbPage"), labels[view][1]);

  safeText(
    $("pageSubtitle"),
    view === "admin"
      ? "Manage timetable, notices and teacher applications."
      : view === "notices"
        ? "Department announcements, events and schedule changes."
        : "Your academic information at a glance."
  );

  if (view === "timetable") renderTimetable();
  if (view === "notices") renderNotices();
  if (view === "profile") renderProfile();
  if (view === "admin") renderAdminData();
  if (view === "teacherApply") buildTeacherAssignments();
}

function teacherCanSee(entry) {
  if (currentUser?.role !== "teacher") return true;

  return (currentUser.assignments || []).some(assignment =>
    assignment.course === entry.course &&
    Number(assignment.semester) === Number(entry.semester) &&
    (assignment.subjects || []).includes(entry.subject)
  );
}

function getFilteredTimetable() {
  const course = $("ttCourse").value;
  const semester = Number($("ttSemester").value);
  const day = $("ttDay").value;

  return state.timetable.filter(entry =>
    entry.course === course &&
    Number(entry.semester) === semester &&
    (day === "All" || entry.day === day) &&
    teacherCanSee(entry)
  );
}

function renderTimetable() {
  if (!currentUser) return;

  const entries = getFilteredTimetable();
  const body = $("timetableBody");

  body.replaceChildren();

  $("emptyTimetable").classList.toggle("hidden", entries.length > 0);

  const tableWrap = body.closest(".table-wrap");

  if (tableWrap) {
    tableWrap.classList.toggle("hidden", entries.length === 0);
  }

  safeText(
    $("ttSummary"),
    `${$("ttCourse").value} · Semester ${$("ttSemester").value} · ${entries.length} entries`
  );

  entries.forEach(entry => {
    const row = document.createElement("tr");

    [entry.day, entry.time, entry.subject, entry.faculty, entry.room]
      .forEach((value, index) => {
        const cell = document.createElement("td");

        if (index === 2) {
          const chip = document.createElement("span");
          chip.className = "subject-chip";
          chip.textContent = value;
          cell.appendChild(chip);
        } else {
          cell.textContent = value;
        }

        row.appendChild(cell);
      });

    body.appendChild(row);
  });

  $("teacherTimetablePanel").classList.toggle(
    "hidden",
    currentUser.role !== "teacher"
  );

  if (currentUser.role === "teacher") {
    safeText(
      $("teacherScopeText"),
      "Displayed entries are limited to the assignments approved in this demo."
    );
  }
}

function renderNotices() {
  const container = $("allNotices");
  if (!container) return;

  container.replaceChildren();

  [...state.notices]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .forEach(notice => {
      const card = document.createElement("article");
      card.className = "notice-card";

      const category = document.createElement("span");
      category.className = "notice-type";
      category.textContent = notice.category;

      const title = document.createElement("h3");
      title.textContent = notice.title;

      const description = document.createElement("p");
      description.textContent = notice.text;

      const date = document.createElement("div");
      date.className = "notice-date";
      date.textContent = notice.date || "";

      card.append(category, title);

      if (notice.photo) {
        const image = document.createElement("img");
        image.src = notice.photo;
        image.alt = "Notice or event";
        card.appendChild(image);
      }

      card.append(description, date);

      if (notice.effective) {
        const effective = document.createElement("p");
        effective.className = "muted";
        effective.textContent =
          `Effective: ${new Date(notice.effective).toLocaleString("en-IN")}`;
        card.appendChild(effective);
      }

      container.appendChild(card);
    });
}

function renderLatestNotices() {
  const container = $("latestNotices");
  if (!container) return;

  container.replaceChildren();

  [...state.notices]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 3)
    .forEach(notice => {
      const item = document.createElement("div");
      item.className = "notice-item";

      const symbol = document.createElement("div");
      symbol.className = "notice-symbol";
      symbol.textContent =
        notice.category === "Urgent" ? "!" :
        notice.category === "Event" ? "★" : "◉";

      const content = document.createElement("div");
      const title = document.createElement("div");
      const date = document.createElement("div");

      title.className = "notice-title";
      title.textContent = notice.title;

      date.className = "notice-date";
      date.textContent = `${notice.category} · ${notice.date}`;

      content.append(title, date);
      item.append(symbol, content);
      container.appendChild(item);
    });
}

function renderTodaySchedule() {
  const container = $("todaySchedule");
  container.replaceChildren();

  if (currentUser.role === "admin") {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent =
      "Main Admin mode: manage timetable, notices, events and teacher access.";
    container.appendChild(message);
    return;
  }

  let entries;

  if (currentUser.role === "teacher") {
    entries = state.timetable.filter(teacherCanSee).slice(0, 4);
  } else {
    entries = state.timetable.filter(entry =>
      entry.course === currentUser.course &&
      Number(entry.semester) === Number(currentUser.semester) &&
      entry.day === "Monday"
    ).slice(0, 4);
  }

  if (!entries.length) {
    container.textContent = "No schedule entries available.";
    return;
  }

  entries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "schedule-item";

    const time = document.createElement("div");
    time.className = "schedule-time";
    time.textContent = `${entry.day} · ${entry.time}`;

    const line = document.createElement("div");
    line.className = "schedule-line";

    const content = document.createElement("div");
    const subject = document.createElement("div");
    const detail = document.createElement("div");

    subject.className = "schedule-subject";
    subject.textContent = entry.subject;

    detail.className = "schedule-detail";
    detail.textContent = `${entry.faculty} · ${entry.room}`;

    content.append(subject, detail);
    item.append(time, line, content);
    container.appendChild(item);
  });
}

function renderProfile() {
  if (!currentUser) return;

  const avatar = $("profileAvatar");
  avatar.replaceChildren();

  if (currentUser.photo) {
    const image = document.createElement("img");
    image.src = currentUser.photo;
    image.alt = "Profile photo";
    avatar.appendChild(image);
  } else {
    avatar.textContent = currentUser.name.charAt(0).toUpperCase();
  }

  safeText($("profileName"), currentUser.name);
  safeText($("profileRole"), currentUser.role.toUpperCase());
  safeText($("profileRoll"), currentUser.roll);
  safeText($("profileFolder"), currentUser.folder || "—");
  safeText($("profileCourse"), currentUser.course);

  safeText(
    $("profileSemester"),
    currentUser.role === "student"
      ? `Semester ${currentUser.semester}`
      : "Not applicable"
  );
}

function renderAll() {
  if (!currentUser) return;

  safeText($("welcomeName"), currentUser.name);
  safeText($("avatarBtn"), currentUser.name.charAt(0).toUpperCase());
  safeText($("sidebarAvatar"), currentUser.name.charAt(0).toUpperCase());
  safeText($("sidebarName"), currentUser.name);
  safeText($("sidebarRole"), currentUser.role.toUpperCase());

  safeText(
    $("todayDate"),
    new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  );

  safeText($("courseStat"), currentUser.course);

  safeText(
    $("semesterStat"),
    currentUser.role === "admin"
      ? "Admin"
      : currentUser.role === "teacher"
        ? "Teacher"
        : `Semester ${currentUser.semester}`
  );

  const timetableCount =
    currentUser.role === "admin"
      ? state.timetable.length
      : currentUser.role === "teacher"
        ? state.timetable.filter(teacherCanSee).length
        : state.timetable.filter(entry =>
            entry.course === currentUser.course &&
            Number(entry.semester) === Number(currentUser.semester)
          ).length;

  safeText($("classStat"), timetableCount);
  safeText($("noticeStat"), state.notices.length);
  safeText($("noticeCount"), state.notices.length);

  renderTodaySchedule();
  renderLatestNotices();
  renderNotices();
  renderProfile();
}

function buildTeacherAssignments() {
  const container = $("teacherAssignments");

  if (!container || container.dataset.built === "true") return;

  container.dataset.built = "true";

  Object.entries(courses).forEach(([course, total]) => {
    for (let semester = 1; semester <= total; semester++) {
      const card = document.createElement("div");
      card.className = "assignment-card";

      const label = document.createElement("label");
      const mainCheckbox = document.createElement("input");

      mainCheckbox.type = "checkbox";
      mainCheckbox.dataset.course = course;
      mainCheckbox.dataset.semester = String(semester);

      const text = document.createElement("span");
      text.textContent = `${course} · Semester ${semester}`;

      label.append(mainCheckbox, text);

      const subjectsBox = document.createElement("div");
      subjectsBox.className = "assignment-subjects hidden";

      const hint = document.createElement("small");
      hint.textContent = "Choose subject(s):";
      subjectsBox.appendChild(hint);

      subjectNames.forEach(subject => {
        const subLabel = document.createElement("label");
        const subCheckbox = document.createElement("input");
        const subText = document.createElement("span");

        subCheckbox.type = "checkbox";
        subCheckbox.value = subject;
        subCheckbox.dataset.assignment = `${course}|${semester}`;

        subText.textContent = subject;

        subLabel.style.cssText =
          "display:flex;gap:6px;align-items:center;margin:7px 0 0 20px;font-weight:500";

        subLabel.append(subCheckbox, subText);
        subjectsBox.appendChild(subLabel);
      });

      mainCheckbox.addEventListener("change", () => {
        subjectsBox.classList.toggle("hidden", !mainCheckbox.checked);
      });

      card.append(label, subjectsBox);
      container.appendChild(card);
    }
  });
}

function readImage(file, preview) {
  if (!file) {
    preview.replaceChildren();
    return Promise.resolve("");
  }

  if (!file.type.startsWith("image/")) {
    toast("Please select an image file.");
    return Promise.resolve("");
  }

  if (file.size > 500 * 1024) {
    toast("Please use an image smaller than 500 KB for this demo.");
    return Promise.resolve("");
  }

  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = document.createElement("img");
      image.src = reader.result;
      image.alt = "Image preview";

      preview.replaceChildren(image);
      resolve(reader.result);
    };

    reader.onerror = () => {
      toast("Could not read the image.");
      resolve("");
    };

    reader.readAsDataURL(file);
  });
}

function renderTeacherApplications() {
  const container = $("teacherApplicationsList");
  if (!container) return;

  container.replaceChildren();

  const pending = state.applications.filter(
    application => application.status === "pending"
  );

  safeText($("pendingCount"), `${pending.length} pending`);

  if (!state.applications.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No teacher applications yet.";
    container.appendChild(empty);
    return;
  }

  [...state.applications].reverse().forEach(application => {
    const row = document.createElement("div");
    row.className = "admin-row";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("p");
    const scope = document.createElement("p");

    title.textContent = `${application.name} · ${application.username}`;

    meta.textContent =
      `${application.email} · ${application.status.toUpperCase()} · ${application.date}`;

    scope.textContent = (application.assignments || [])
      .map(assignment =>
        `${assignment.course} Sem ${assignment.semester}: ${assignment.subjects.join(", ")}`
      )
      .join(" | ");

    details.append(title, meta, scope);

    if (application.message) {
      const message = document.createElement("p");
      message.textContent = `Message: ${application.message}`;
      details.appendChild(message);
    }

    if (application.photo) {
      const image = document.createElement("img");
      image.src = application.photo;
      image.alt = "Teacher applicant photo";
      image.style.cssText =
        "width:55px;height:55px;object-fit:cover;border-radius:10px;margin-top:8px";
      details.appendChild(image);
    }

    const actions = document.createElement("div");
    actions.className = "row-actions";

    if (application.status === "pending") {
      const approve = document.createElement("button");
      approve.className = "mini-btn success";
      approve.textContent = "Approve";

      approve.addEventListener("click", () => {
        application.status = "approved";

        state.approvedTeachers = state.approvedTeachers || [];

        state.approvedTeachers = state.approvedTeachers.filter(
          teacher => teacher.username.toLowerCase() !== application.username.toLowerCase()
        );

        state.approvedTeachers.push({
          name: application.name,
          email: application.email,
          username: application.username,
          photo: application.photo,
          assignments: application.assignments
        });

        saveState();
        renderAdminData();

        toast("Teacher approved in this browser demo.");
      });

      const reject = document.createElement("button");
      reject.className = "mini-btn danger";
      reject.textContent = "Reject";

      reject.addEventListener("click", () => {
        application.status = "rejected";
        saveState();
        renderAdminData();
        toast("Application rejected.");
      });

      actions.append(approve, reject);
    }

    row.append(details, actions);
    container.appendChild(row);
  });
}

function renderAdminData() {
  renderTeacherApplications();

  const container = $("adminDataList");
  if (!container) return;

  container.replaceChildren();

  const customTimetable = state.timetable.filter(entry => !entry.demo);
  const customNotices = state.notices.filter(notice => !notice.demo);

  if (!customTimetable.length && !customNotices.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No custom timetable entries or notices yet.";
    container.appendChild(empty);
  }

  customTimetable.forEach(entry => {
    const row = document.createElement("div");
    row.className = "admin-row";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("p");

    title.textContent = entry.subject;
    meta.textContent =
      `${entry.course} · Semester ${entry.semester} · ${entry.day} · ${entry.time}`;

    details.append(title, meta);

    const remove = document.createElement("button");
    remove.className = "mini-btn danger";
    remove.textContent = "Remove";

    remove.addEventListener("click", () => {
      state.timetable = state.timetable.filter(item => item.id !== entry.id);
      saveState();
      renderAll();
      renderAdminData();
      toast("Timetable entry removed.");
    });

    row.append(details, remove);
    container.appendChild(row);
  });

  customNotices.forEach(notice => {
    const row = document.createElement("div");
    row.className = "admin-row";

    const details = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("p");

    title.textContent = notice.title;
    meta.textContent = `Notice · ${notice.category} · ${notice.date}`;

    details.append(title, meta);

    const remove = document.createElement("button");
    remove.className = "mini-btn danger";
    remove.textContent = "Remove";

    remove.addEventListener("click", () => {
      state.notices = state.notices.filter(item => item.id !== notice.id);
      saveState();
      renderAll();
      renderAdminData();
      toast("Notice removed.");
    });

    row.append(details, remove);
    container.appendChild(row);
  });
}

// LOGIN AND NAVIGATION

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => switchLoginRole(tab.dataset.role));
});

$("loginForm").addEventListener("submit", handleLogin);

$("course").addEventListener("change", () => {
  fillSemesters($("semester"), $("course").value);
});

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showView(button.dataset.go));
});

$("avatarBtn").addEventListener("click", () => showView("profile"));

$("logoutBtn").addEventListener("click", () => {
  currentUser = null;
  currentRole = "student";

  $("loginForm").reset();
  switchLoginRole("student");

  $("dashboardPage").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
  $("avatarBtn").classList.add("hidden");

  toast("You have signed out.");
});

$("ttCourse").addEventListener("change", () => {
  fillSemesters($("ttSemester"), $("ttCourse").value);
  renderTimetable();
});

$("ttSemester").addEventListener("change", renderTimetable);
$("ttDay").addEventListener("change", renderTimetable);

$("printBtn").addEventListener("click", () => {
  if (activeView !== "timetable") showView("timetable");
  window.print();
});

// ADMIN: TIMETABLE

$("adminCourse").addEventListener("change", () => {
  fillSemesters($("adminSemester"), $("adminCourse").value);
});

$("addClassForm").addEventListener("submit", event => {
  event.preventDefault();

  if (currentUser?.role !== "admin") {
    toast("Main Admin access required.");
    return;
  }

  const entry = {
    id: `custom-${Date.now()}`,
    course: $("adminCourse").value,
    semester: Number($("adminSemester").value),
    day: $("adminDay").value,
    time: $("adminTime").value.trim(),
    subject: $("adminSubject").value.trim(),
    faculty: $("adminFaculty").value.trim(),
    room: $("adminRoom").value.trim(),
    demo: false
  };

  if (!entry.time || !entry.subject || !entry.faculty || !entry.room) {
    toast("Please complete all timetable fields.");
    return;
  }

  state.timetable.push(entry);
  saveState();

  $("addClassForm").reset();
  fillSemesters($("adminSemester"), $("adminCourse").value);

  renderAll();
  renderAdminData();

  toast("Timetable entry added in this browser.");
});

// IMAGE UPLOAD PREVIEWS

$("noticePhoto").addEventListener("change", async () => {
  noticePhotoData = await readImage(
    $("noticePhoto").files[0],
    $("noticePhotoPreview")
  );
});

$("teacherPhoto").addEventListener("change", async () => {
  teacherPhotoData = await readImage(
    $("teacherPhoto").files[0],
    $("teacherPhotoPreview")
  );
});

// ADMIN: NOTICES AND EVENTS

$("addNoticeForm").addEventListener("submit", event => {
  event.preventDefault();

  if (currentUser?.role !== "admin") {
    toast("Main Admin access required.");
    return;
  }

  const title = $("noticeTitle").value.trim();
  const text = $("noticeText").value.trim();

  if (!title || !text) {
    toast("Please enter a title and details.");
    return;
  }

  const notice = {
    id: Date.now(),
    title,
    category: $("noticeCategory").value,
    text,
    date: new Date().toLocaleDateString("en-IN"),
    effective: $("noticeDateTime").value,
    photo: noticePhotoData,
    sound: $("noticeSound").checked,
    demo: false
  };

  state.notices.push(notice);
  saveState();

  $("addNoticeForm").reset();
  noticePhotoData = "";
  $("noticePhotoPreview").replaceChildren();

  renderAll();
  renderAdminData();

  toast("Notice published in this browser.");

  if (
    notice.sound ||
    notice.category === "Urgent" ||
    notice.category === "Timetable Change"
  ) {
    playAlertSound();
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`SVSU CSE: ${title}`, {
      body: text.slice(0, 150)
    });
  }
});

// TEACHER APPLICATION FORM

$("teacherApplicationForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("teacherName").value.trim();
  const email = $("teacherEmail").value.trim();
  const username = $("teacherUsername").value.trim();

  if (!name || !email || !username) {
    toast("Please complete name, email and staff ID.");
    return;
  }

  const duplicate =
    state.applications.some(item =>
      item.username.toLowerCase() === username.toLowerCase()
    ) ||
    state.approvedTeachers.some(item =>
      item.username.toLowerCase() === username.toLowerCase()
    );

  if (duplicate) {
    toast("This staff ID is already registered.");
    return;
  }

  const assignments = [];

  document.querySelectorAll("#teacherAssignments > .assignment-card").forEach(card => {
    const main = card.querySelector("input[type=checkbox][data-course]");

    if (!main?.checked) return;

    const selectedSubjects = [
      ...card.querySelectorAll("input[data-assignment]:checked")
    ].map(input => input.value);

    if (selectedSubjects.length) {
      assignments.push({
        course: main.dataset.course,
        semester: Number(main.dataset.semester),
        subjects: selectedSubjects
      });
    }
  });

  if (!assignments.length) {
    toast("Select at least one semester and subject.");
    return;
  }

  const application = {
    id: Date.now(),
    name,
    email,
    username,
    photo: teacherPhotoData,
    message: $("teacherMessage").value.trim(),
    assignments,
    status: "pending",
    date: new Date().toLocaleDateString("en-IN")
  };

  state.applications.push(application);
  saveState();

  $("teacherApplicationForm").reset();
  teacherPhotoData = "";
  $("teacherPhotoPreview").replaceChildren();

  document.querySelectorAll("#teacherAssignments input").forEach(input => {
    input.checked = false;
  });

  document.querySelectorAll(".assignment-subjects").forEach(element => {
    element.classList.add("hidden");
  });

  safeText(
    $("teacherApplicationStatus"),
    "Application submitted. Main Admin approval is required. This demo does not send email."
  );

  $("teacherApplicationStatus").classList.remove("hidden");

  renderAdminData();
  toast("Teacher application submitted.");
});

// RESET LOCAL DEMO DATA

$("resetDemoBtn").addEventListener("click", () => {
  if (!window.confirm("Reset all local demo data and changes?")) return;

  state = defaultState();
  saveState();

  renderAll();
  renderAdminData();
  renderTimetable();

  toast("Demo data reset.");
});

// BROWSER NOTIFICATIONS

$("enableAlertsBtn").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    safeText($("alertStatus"), "This browser does not support notifications.");
    toast("Browser notifications are not supported.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    safeText(
      $("alertStatus"),
      permission === "granted"
        ? "Notifications enabled for this browser. Background alerts need a backend."
        : "Notification permission was not granted."
    );

    if (permission === "granted") {
      toast("Browser notifications enabled.");
      playAlertSound();
    }
  } catch (error) {
    toast("Could not enable browser notifications.");
  }
});

function playAlertSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    audioContext = audioContext || new AudioContextClass();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    setTimeout(() => {
      oscillator.stop();
      oscillator.disconnect();
      gain.disconnect();
    }, 280);
  } catch (error) {
    console.warn("Sound playback was blocked.", error);
  }
}

// TEACHER APPLICATION MODAL

$("showTeacherApplication").addEventListener("click", () => {
  $("applicationModal").classList.remove("hidden");
});

$("closeApplicationModal").addEventListener("click", () => {
  $("applicationModal").classList.add("hidden");
});

$("applicationModal").addEventListener("click", event => {
  if (event.target === $("applicationModal")) {
    $("applicationModal").classList.add("hidden");
  }
});

$("modalGoApply").addEventListener("click", () => {
  $("applicationModal").classList.add("hidden");

  $("loginPage").classList.add("hidden");
  $("dashboardPage").classList.remove("hidden");

  currentUser = {
    name: "Teacher Applicant",
    roll: "application",
    folder: "Not approved",
    course: "Teacher applicant",
    semester: 0,
    role: "student"
  };

  $("adminNav").classList.add("hidden");
  $("teacherApplyNav").classList.remove("hidden");

  showView("teacherApply");
  renderAll();
});

// INITIALIZE PAGE

fillSemesters($("semester"), $("course").value);
fillSemesters($("ttSemester"), $("ttCourse").value);
fillSemesters($("adminSemester"), $("adminCourse").value);

switchLoginRole("student");
renderNotices();