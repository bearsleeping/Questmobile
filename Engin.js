﻿﻿﻿const App = (() => {
  const legacyStorageKey = "workflow_entries_v1";
  const legacyProfileStateKey = "workflow_profile_v1";
  const activeUserKey = "workflow_active_user_v1";
  const localSessionKey = "workflow_local_session_v1";
  const cloudTable = "workflow_profiles";
  const leaderboardTable = "workflow_leaderboard";
  const timerStorageKey = "workflow_timer_state_v1";
  const plannerTable = "workflow_planner_notes";
  const plannerLocalKey = "workflow_planner_board_v1";
  const MINIMUM_HOURLY_RATE = 31.4;
  const STANDARD_PIT_RATE = 0.12;
  const YOUTH_PIT_RELIEF_LIMIT = 85528;
  const EXP_PER_MINUTE = 0.2;
  const EXP_PER_FULL_HOUR_BONUS = 4;
  const AUTO_REMINDER_MINUTES = 120;
  const LEVEL_BASE_EXP = 240;
  const LEVEL_STEP_EXP = 90;
  const MAX_PROFILE_LEVEL = 100;
  const DECAY_GRACE_DAYS = 2;
  const DECAY_EXP_PER_DAY = 18;
  const MAX_RENDERED_ENTRIES = 250;
  const PROGRESS_ANIMATION_MS = 520;
  const SUB_RANK_LABELS = ["I", "II", "III"];
  const MIN_ACHIEVEMENT_DAY_MINUTES = 25;
  const ACHIEVEMENTS = [
    { id: "first_shift", title: "Pierwsza Zmiana", description: "Przepracuj lacznie 10 godzin.", rarity: "common", rarityLabel: "Pospolite", rewardExp: 30, requirement: { type: "totalHours", value: 10 } },
    { id: "guild_path", title: "Sciezka Gildii", description: "Wbij poziom 8 profilu.", rarity: "common", rarityLabel: "Pospolite", rewardExp: 35, requirement: { type: "level", value: 8 } },
    { id: "seven_streak", title: "Seria 7", description: "Utrzymaj serie 7 dni pracy.", rarity: "uncommon", rarityLabel: "Niepospolite", rewardExp: 55, requirement: { type: "streak", value: 7 } },
    { id: "month_40h", title: "Miesi?czny Rytm", description: "Wypracuj 40h w obecnym miesi?cu.", rarity: "uncommon", rarityLabel: "Niepospolite", rewardExp: 70, requirement: { type: "monthHours", value: 40 } },
    { id: "craftsman_100h", title: "Rzemieslnik", description: "Przepracuj lacznie 100 godzin.", rarity: "rare", rarityLabel: "Rzadkie", rewardExp: 110, requirement: { type: "totalHours", value: 100 } },
    { id: "silver_rank", title: "Awans Srebra", description: "Osiagnij range Silver.", rarity: "rare", rarityLabel: "Rzadkie", rewardExp: 120, requirement: { type: "rankMinLevel", value: 13 } },
    { id: "diamond_rank", title: "Elita Diamentu", description: "Osiagnij range Diamond.", rarity: "epic", rarityLabel: "Epickie", rewardExp: 180, requirement: { type: "rankMinLevel", value: 49 } },
    { id: "streak_21", title: "Niezlamany", description: "Utrzymaj serie 21 dni pracy.", rarity: "epic", rarityLabel: "Epickie", rewardExp: 220, requirement: { type: "streak", value: 21 } },
    { id: "eternal_guard", title: "Wieczny Straznik", description: "Osiagnij Eternal i utrzymaj serie 30 dni.", rarity: "legendary", rarityLabel: "Legendarne", rewardExp: 350, requirement: { type: "combo", level: 85, streak: 30 } }
  ];
  const RANKS = [
    { minLevel: 1, name: "Bronze" },
    { minLevel: 13, name: "Silver" },
    { minLevel: 25, name: "Gold" },
    { minLevel: 37, name: "Platinum" },
    { minLevel: 49, name: "Diamond" },
    { minLevel: 61, name: "Mythic" },
    { minLevel: 73, name: "Ascended" },
    { minLevel: 85, name: "Eternal" }
  ];
  const RANK_THEMES = {
    bronze: { accent: "#b07a4f", accentSoft: "#6b4428", rgb: "176,122,79", rare: false },
    silver: { accent: "#c5cbd3", accentSoft: "#717883", rgb: "197,203,211", rare: false },
    gold: { accent: "#d9b24f", accentSoft: "#6f5723", rgb: "217,178,79", rare: false },
    platinum: { accent: "#89b6bf", accentSoft: "#35575f", rgb: "137,182,191", rare: false },
    diamond: { accent: "#8ec5ff", accentSoft: "#2e4a68", rgb: "142,197,255", rare: true },
    mythic: { accent: "#c8a4ff", accentSoft: "#4b3570", rgb: "200,164,255", rare: true },
    ascended: { accent: "#7cf2d6", accentSoft: "#2b6658", rgb: "124,242,214", rare: true },
    eternal: { accent: "#ffdf7a", accentSoft: "#6e5b24", rgb: "255,223,122", rare: true }
  };
  let entries = [];
  let prefersReducedMotion = false;
  let selectedTag = "";
  let calendarViewDate = new Date();
  let earningsViewDate = new Date();
  let plannerViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let plannerSelectedDate = toIsoDate(new Date());
  let plannerHighlightedDate = "";
  let plannerPendingScrollToMatch = false;
  let inactivityPenaltyState = { inactiveDays: 0, decayDays: 0, expPenalty: 0 };
  let leaderboardRows = [];
  let activeUserId = "";
  let authClient = null;
  let authUser = null;
  let cloudSyncTimerId = null;
  let leaderboardSyncTimerId = null;
  let leaderboardLoading = false;
  let leaderboardLastFetchAt = 0;
  let plannerNotes = [];
  let plannerCloudEnabled = false;
  let lastKnownLevel = null;
  let profileState = {
    unlockedAchievementIds: [],
    bonusExp: 0,
    taxReliefUnder26: false,
    vacationDays: [],
    offDays: [],
    sickDays: [],
    absentDays: []
  };
  const progressAnimations = new WeakMap();
  const timerState = {
    running: false,
    startedAt: 0,
    pausedMs: 0,
    pauseStartedAt: 0,
    reminderShown: false,
    tickIntervalId: null
  };

  const elements = {
    authScreen: document.getElementById("authScreen"),
    authForm: document.getElementById("authForm"),
    authEmailInput: document.getElementById("authEmailInput"),
    authPasswordInput: document.getElementById("authPasswordInput"),
    authLoginBtn: document.getElementById("authLoginBtn"),
    authRegisterBtn: document.getElementById("authRegisterBtn"),
    editNicknameBtn: document.getElementById("editNicknameBtn"),
    accountEditor: document.getElementById("accountEditor"),
    accountNicknameInput: document.getElementById("accountNicknameInput"),
    accountAvatarUrlInput: document.getElementById("accountAvatarUrlInput"),
    accountAvatarFileInput: document.getElementById("accountAvatarFileInput"),
    accountFileTriggerBtn: document.getElementById("accountFileTriggerBtn"),
    accountHourlyRateInput: document.getElementById("accountHourlyRateInput"),
    accountAvatarPreview: document.getElementById("accountAvatarPreview"),
    accountUnder26Toggle: document.getElementById("accountUnder26Toggle"),
    accountSaveBtn: document.getElementById("accountSaveBtn"),
    accountCancelBtn: document.getElementById("accountCancelBtn"),
    accountCloseBtn: document.getElementById("accountCloseBtn"),
    topbarLogoutBtn: document.getElementById("topbarLogoutBtn"),
    sidebar: document.getElementById("sidebar"),
    authStatus: document.getElementById("authStatus"),
    navViewButtons: document.querySelectorAll(".nav-item[data-view]"),
    viewMain: document.getElementById("viewMain"),
    viewProgress: document.getElementById("viewProgress"),
    viewPlanner: document.getElementById("viewPlanner"),
    toggleSidebar: document.getElementById("toggleSidebar"),
    entryFormPanel: document.getElementById("entryFormPanel"),
    autoDateText: document.getElementById("autoDateText"),
    workDate: document.getElementById("workDate"),
    workDateDisplayInput: document.getElementById("workDateDisplayInput"),
    workDateDisplay: document.getElementById("workDateDisplay"),
    form: document.getElementById("workForm"),
    startTime: document.getElementById("startTime"),
    startTimeDisplay: document.getElementById("startTimeDisplay"),
    endTime: document.getElementById("endTime"),
    endTimeDisplay: document.getElementById("endTimeDisplay"),
    quickTags: document.getElementById("quickTags"),
    timerDisplay: document.getElementById("timerDisplay"),
    timerStatus: document.getElementById("timerStatus"),
    timerStartBtn: document.getElementById("timerStartBtn"),
    timerPauseBtn: document.getElementById("timerPauseBtn"),
    timerStopBtn: document.getElementById("timerStopBtn"),
    list: document.getElementById("entriesList"),
    weekBars: document.getElementById("weekBars"),
    monthCalendar: document.getElementById("monthCalendar"),
    calendarMonthLabel: document.getElementById("calendarMonthLabel"),
    calendarPrevBtn: document.getElementById("calendarPrevBtn"),
    calendarNextBtn: document.getElementById("calendarNextBtn"),
    calendarAddBtn: document.getElementById("calendarAddBtn"),
    calendarEventModal: document.getElementById("calendarEventModal"),
    calendarEventFrom: document.getElementById("calendarEventFrom"),
    calendarEventFromDisplay: document.getElementById("calendarEventFromDisplay"),
    calendarEventTo: document.getElementById("calendarEventTo"),
    calendarEventToDisplay: document.getElementById("calendarEventToDisplay"),
    calendarEventType: document.getElementById("calendarEventType"),
    calendarEventSaveBtn: document.getElementById("calendarEventSaveBtn"),
    calendarEventCancelBtn: document.getElementById("calendarEventCancelBtn"),
    monthTotal: document.getElementById("monthTotal"),
    todayHours: document.getElementById("todayHours"),
    streakDays: document.getElementById("streakDays"),
    monthHours: document.getElementById("monthHours"),
    totalHours: document.getElementById("totalHours"),
    entryCount: document.getElementById("entryCount"),
    avgHours: document.getElementById("avgHours"),
    userProfileLevel: document.getElementById("userProfileLevel"),
    userRankLevel: document.getElementById("userRankLevel"),
    userExp: document.getElementById("userExp"),
    levelMeta: document.getElementById("levelMeta"),
    levelProgressBar: document.getElementById("levelProgressBar"),
    navUserLevel: document.getElementById("navUserLevel"),
    navUserRank: document.getElementById("navUserRank"),
    navLevelProgressBar: document.getElementById("navLevelProgressBar"),
    navProgressMeta: document.getElementById("navProgressMeta"),
    progressNavUserLevel: document.getElementById("progressNavUserLevel"),
    progressNavUserRank: document.getElementById("progressNavUserRank"),
    progressNavLevelProgressBar: document.getElementById("progressNavLevelProgressBar"),
    progressNavProgressMeta: document.getElementById("progressNavProgressMeta"),
    progressProfileLevel: document.getElementById("progressProfileLevel"),
    progressRankLevel: document.getElementById("progressRankLevel"),
    progressExp: document.getElementById("progressExp"),
    progressEntries: document.getElementById("progressEntries"),
    progressMonthTotal: document.getElementById("progressMonthTotal"),
    progressAvgHours: document.getElementById("progressAvgHours"),
    earningsRateBadge: document.getElementById("earningsRateBadge"),
    earningsModeLabel: document.getElementById("earningsModeLabel"),
    earningsMonthGross: document.getElementById("earningsMonthGross"),
    earningsMonthNet: document.getElementById("earningsMonthNet"),
    earningsYearGross: document.getElementById("earningsYearGross"),
    earningsYearNet: document.getElementById("earningsYearNet"),
    earningsHint: document.getElementById("earningsHint"),
    earningsMonthLabel: document.getElementById("earningsMonthLabel"),
    earningsPrevBtn: document.getElementById("earningsPrevBtn"),
    earningsNextBtn: document.getElementById("earningsNextBtn"),
    leaderboardStatus: document.getElementById("leaderboardStatus"),
    leaderboardBody: document.getElementById("leaderboardBody"),
    userRank: document.getElementById("userRank"),
    nextRank: document.getElementById("nextRank"),
    rankMeta: document.getElementById("rankMeta"),
    rankProgressBar: document.getElementById("rankProgressBar"),
    rankSteps: document.getElementById("rankSteps"),
    rankBox: document.getElementById("rankBox"),
    achievementsList: document.getElementById("achievementsList"),
    nextAchievement: document.getElementById("nextAchievement"),
    rewardBank: document.getElementById("rewardBank"),
    mainProfileAvatar: document.getElementById("mainProfileAvatar"),
    mainProfileName: document.getElementById("mainProfileName"),
    progressProfileAvatar: document.getElementById("progressProfileAvatar"),
    progressProfileName: document.getElementById("progressProfileName"),
    plannerProfileAvatar: document.getElementById("plannerProfileAvatar"),
    plannerProfileName: document.getElementById("plannerProfileName"),
    plannerStatus: document.getElementById("plannerStatus"),
    plannerForm: document.getElementById("plannerForm"),
    plannerTitleInput: document.getElementById("plannerTitleInput"),
    plannerStartDateInput: document.getElementById("plannerStartDateInput"),
    plannerStartDateDisplay: document.getElementById("plannerStartDateDisplay"),
    plannerEndDateInput: document.getElementById("plannerEndDateInput"),
    plannerEndDateDisplay: document.getElementById("plannerEndDateDisplay"),
    plannerContentInput: document.getElementById("plannerContentInput"),
    plannerPinnedInput: document.getElementById("plannerPinnedInput"),
    plannerRefreshBtn: document.getElementById("plannerRefreshBtn"),
    plannerCalendarPrevBtn: document.getElementById("plannerCalendarPrevBtn"),
    plannerCalendarNextBtn: document.getElementById("plannerCalendarNextBtn"),
    plannerCalendarMonthLabel: document.getElementById("plannerCalendarMonthLabel"),
    plannerCalendarGrid: document.getElementById("plannerCalendarGrid"),
    plannerSelectedDateLabel: document.getElementById("plannerSelectedDateLabel"),
    plannerSelectedDateMeta: document.getElementById("plannerSelectedDateMeta"),
    plannerDayAgenda: document.getElementById("plannerDayAgenda"),
    plannerNotesList: document.getElementById("plannerNotesList"),
    iosInstallModal: document.getElementById("iosInstallModal"),
    iosInstallCloseBtn: document.getElementById("iosInstallCloseBtn"),
    dayInfoModal: document.getElementById("dayInfoModal"),
    dayInfoModalTitle: document.getElementById("dayInfoModalTitle"),
    dayInfoModalContent: document.getElementById("dayInfoModalContent"),
    dayInfoModalCloseBtn: document.getElementById("dayInfoModalCloseBtn"),
    todayDate: document.getElementById("todayDate"), // This element does not exist in mobile.html
    clearAllBtn: document.getElementById("clearAllBtn")
  };

  function fixPolishText(value) {
    if (typeof value !== "string" || !value) {
      return value;
    }
    let text = value;
    const pairs = [
      [/siďż˝"/g, "się"],
      [/ďż˝\["/g, "✕"],
      [/ďż˝yďż˝/g, "⏻"],
      [/ďż˝/g, "←"],
      [/ďż˝_/g, "→"],
      [/9ďż˝adowanie/g, "Ładowanie"],
      [/podglďż˝&d/gi, "podgląd"],
      [/zdjďż˝"cie/gi, "zdjęcie"],
      [/g\?\?wny/gi, "główny"],
      [/\?\?cznie/g, "Łącznie"],
      [/ca\?y/gi, "cały"],
      [/obci\?\?enie/gi, "obciążenie"],
      [/bie\?\?cego/gi, "bieżącego"],
      [/\?rednio/g, "Średnio"],
      [/miesi\?czny/gi, "miesięczny"],
      [/miesi\?c/gi, "miesiąc"],
      [/dzie\?/gi, "dzień"],
      [/post\?p/gi, "postęp"],
      [/nast\?p/gi, "następ"],
      [/osi\?gni\?cie/gi, "osiągnięcie"],
      [/u\?ytkownik/gi, "użytkownik"],
      [/zesp\?\?/gi, "zespół"],
      [/pok\?j/gi, "pokój"],
      [/utw\?rz/gi, "utwórz"],
      [/do\?\?cz/gi, "dołącz"],
      [/opu\?\?/gi, "opuść"],
      [/odrzu\?/gi, "odrzuć"],
      [/zapro\?/gi, "zaproś"],
      [/wys\?a\?/gi, "wysłać"],
      [/przychodz\?ce/gi, "przychodzące"],
      [/mo\?esz/gi, "możesz"],
      [/si\?/gi, "się"],
      [/has\?o/gi, "hasło"],
      [/zobaczy\?/gi, "zobaczyć"],
      [/zalogowa\?/gi, "zalogować"],
      [/utworzy\?/gi, "utworzyć"],
      [/dost\?pu/gi, "dostępu"],
      [/od\?wie\?anie/gi, "odświeżanie"],
      [/pocz\?tkowa/gi, "początkowa"],
      [/ko\?cowa/gi, "końcowa"],
      [/p\?\?niej/gi, "później"],
      [/ni\?/gi, "niż"],
      [/ju\?/gi, "już"],
      [/cz\?onka/gi, "członka"],
      [/wys\?ane/gi, "wysłane"],
      [/wys\?ano/gi, "wysłano"],
      [/zako\?czenia/gi, "zakończenia"],
      [/rozpocz\?cia/gi, "rozpoczęcia"],
      [/bezczynno\?\?/gi, "bezczynność"],
      [/wzn\?w/gi, "wznów"],
      [/r\?czny/gi, "ręczny"],
      [/go\?\?/gi, "gość"],
      [/uzupe\?nij/gi, "uzupełnij"]
    ];
    for (const [pattern, replacement] of pairs) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  function normalizeUiPolish() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    textNodes.forEach((node) => {
      node.nodeValue = fixPolishText(node.nodeValue);
    });

    const attrNames = ["aria-label", "title", "placeholder"];
    document.querySelectorAll("*").forEach((el) => {
      attrNames.forEach((name) => {
        if (el.hasAttribute(name)) {
          el.setAttribute(name, fixPolishText(el.getAttribute(name)));
        }
      });
    });
  }

  async function init() {
    applyRuntimeMode();
    if (typeof window.alert === "function") {
      const originalAlert = window.alert.bind(window);
      window.alert = (msg) => originalAlert(fixPolishText(String(msg)));
    }
    normalizeUiPolish();
    setupIosMetaTags();
    ensureIosModalExists();
    bindEvents();
    await initAuth();
    loadEntries();
    loadProfileState();
    await loadPlannerNotes();
    resetPlannerForm();
    initDateDisplaySync();
    setDefaults();
    initDatePickers();
    initTimePickers();
    initCalendarEventForm();
    loadTimerState();
    renderActiveUser();
    updateTimerView();
    updateTimerControls();
    render();
    startEntranceAnimations();
    await loadCloudUserData();
    await loadPlannerNotes(true);
    await renderLeaderboard(true);
    render();
    normalizeUiPolish();
  }

  function initDateDisplaySync() {
    const pairs = [
      { input: elements.workDate, display: elements.workDateDisplayInput },
      { input: elements.plannerStartDateInput, display: elements.plannerStartDateDisplay },
      { input: elements.plannerEndDateInput, display: elements.plannerEndDateDisplay },
      { input: elements.calendarEventFrom, display: elements.calendarEventFromDisplay },
      { input: elements.calendarEventTo, display: elements.calendarEventToDisplay }
    ];

    pairs.forEach(({ input, display }) => {
      if (input && display) {
        const updateDisplay = () => {
          const dateVal = input.value;
          if (!dateVal) {
            display.value = "";
            return;
          }
          const date = new Date(dateVal);
          if (!isNaN(date.getTime())) {
            display.value = date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
          } else {
            display.value = dateVal;
          }
        };
        input.addEventListener("change", updateDisplay);
        input.addEventListener("input", updateDisplay);
        updateDisplay(); // Initial sync
      }
    });
  }

  async function initAuth() {
    activeUserId = localStorage.getItem(localSessionKey) || "guest_local";
    localStorage.setItem(activeUserKey, activeUserId);
    setAuthGate(true);
    updateAuthStatus("Sprawdzanie sesji...");

    const hasSupabase = Boolean(window.supabase && typeof window.supabase.createClient === "function");
    const config = window.__SUPABASE_CONFIG__ || {};
    const url = String(config.url || "").trim();
    const anonKey = String(config.anonKey || "").trim();

    if (!hasSupabase || !url || !anonKey) {
      updateAuthStatus("Brak konfiguracji Supabase. Uzupe?nij supabase.config.js");
      return;
    }

    try {
      authClient = window.supabase.createClient(url, anonKey);
      const sessionResult = await authClient.auth.getSession();
      authUser = sessionResult?.data?.session?.user || null;
      if (authUser) {
        setActiveUserId(`sb_${authUser.id}`);
        updateAuthStatus(`Zalogowano: ${authUser.email || "konto"}`);
        setAuthGate(false);
      } else {
        updateAuthStatus("Zaloguj si? emailem i has?em");
        setAuthGate(true);
      }

      authClient.auth.onAuthStateChange((_event, session) => {
        const wasLoggedIn = !!authUser;
        authUser = session?.user || null;
        if (authUser) {
          if (!wasLoggedIn) playLoginSound();
          setActiveUserId(`sb_${authUser.id}`);
          updateAuthStatus(`Zalogowano: ${authUser.email || "konto"}`);
          setAuthGate(false);
          lastKnownLevel = null;
          loadEntries();
          loadProfileState();
          renderActiveUser();
          render();
          loadPlannerNotes(true).then(render);
          loadCloudUserData().then(render);
          void renderLeaderboard(true);
          return;
        }
        if (wasLoggedIn) playLogoutSound();
        setActiveUserId("guest_local");
        updateAuthStatus("Wylogowano");
        setAuthGate(true);
        lastKnownLevel = null;
        loadEntries();
        loadProfileState();
        leaderboardRows = [];
        renderActiveUser();
        loadPlannerNotes().then(render);
        render();
        void renderLeaderboard(true);
      });
    } catch {
      authClient = null;
      authUser = null;
      updateAuthStatus("Tryb lokalny (offline) - b??d po??czenia z Supabase");
    }
  }

  function updateAuthStatus(text) {
    if (elements.authStatus) {
      elements.authStatus.textContent = fixPolishText(text);
    }
  }

  function setAuthGate(locked) {
    if (elements.authScreen) {
      elements.authScreen.classList.toggle("is-hidden", !locked);
    }
    if (elements.editNicknameBtn) {
      elements.editNicknameBtn.hidden = locked;
    }
    if (elements.topbarLogoutBtn) {
      elements.topbarLogoutBtn.hidden = locked;
    }
    if (locked && elements.accountEditor) {
      elements.accountEditor.hidden = true;
    }
    if (locked && elements.leaderboardBody) {
      elements.leaderboardBody.innerHTML = "";
      if (elements.leaderboardStatus) {
        elements.leaderboardStatus.textContent = "Zaloguj si?, aby zobaczy? ranking.";
      }
    }
    document.body.classList.toggle("auth-locked", locked);
  }

  function setActiveUserId(value) {
    activeUserId = value || "guest_local";
    localStorage.setItem(activeUserKey, activeUserId);
    localStorage.setItem(localSessionKey, activeUserId);
  }

  function getEntriesStorageKey() {
    return `workflow_entries_${activeUserId}`;
  }

  function getProfileStateStorageKey() {
    return `workflow_profile_${activeUserId}`;
  }

  function loadEntries() {
    try {
      const userKey = getEntriesStorageKey();
      let raw = JSON.parse(localStorage.getItem(userKey));
      if (!Array.isArray(raw) && activeUserId === "guest_local") {
        const legacy = JSON.parse(localStorage.getItem(legacyStorageKey));
        if (Array.isArray(legacy)) {
          raw = legacy;
          localStorage.setItem(userKey, JSON.stringify(legacy));
        }
      }
      entries = (Array.isArray(raw) ? raw : []).map(normalizeEntry);
    } catch {
      entries = [];
    }
  }

  function persistEntries() {
    localStorage.setItem(getEntriesStorageKey(), JSON.stringify(entries));
    scheduleCloudSync();
  }

  function loadProfileState() {
    try {
      const userKey = getProfileStateStorageKey();
      let raw = JSON.parse(localStorage.getItem(userKey));
      if ((!raw || typeof raw !== "object") && activeUserId === "guest_local") {
        const legacy = JSON.parse(localStorage.getItem(legacyProfileStateKey));
        if (legacy && typeof legacy === "object") {
          raw = legacy;
          localStorage.setItem(userKey, JSON.stringify(legacy));
        }
      }
      raw = raw && typeof raw === "object" ? raw : {};
      profileState = createProfileState(raw);
    } catch {
      profileState = createProfileState();
    }
  }

  function persistProfileState() {
    localStorage.setItem(getProfileStateStorageKey(), JSON.stringify(profileState));
    scheduleCloudSync();
  }

  function createProfileState(raw = {}) {
    return {
      unlockedAchievementIds: Array.isArray(raw.unlockedAchievementIds) ? raw.unlockedAchievementIds : [],
      bonusExp: Number.isFinite(raw.bonusExp) ? raw.bonusExp : 0,
      hourlyRate: Number.isFinite(raw.hourlyRate) && raw.hourlyRate > 0 ? raw.hourlyRate : MINIMUM_HOURLY_RATE,
      taxReliefUnder26: Boolean(raw.taxReliefUnder26),
      vacationDays: Array.isArray(raw.vacationDays)
        ? raw.vacationDays.filter(isIsoDateLike).sort()
        : Array.isArray(raw.protectedDays)
          ? raw.protectedDays.filter(isIsoDateLike).sort()
          : [],
      offDays: Array.isArray(raw.offDays) ? raw.offDays.filter(isIsoDateLike).sort() : [],
      sickDays: Array.isArray(raw.sickDays) ? raw.sickDays.filter(isIsoDateLike).sort() : [],
      absentDays: Array.isArray(raw.absentDays) ? raw.absentDays.filter(isIsoDateLike).sort() : []
    };
  }

  function getInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) {
      return "U";
    }
    const initials = parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
    return initials || "U";
  }

  function renderActiveUser() {
    const userName = getCurrentUserName();
    const avatar = getInitials(userName);
    const avatarUrl = getCurrentAvatarUrl();

    const nameTargets = [elements.mainProfileName, elements.progressProfileName, elements.plannerProfileName];
    nameTargets.forEach((target) => {
      if (target) {
        target.textContent = userName;
      }
    });

    const avatarTargets = [elements.mainProfileAvatar, elements.progressProfileAvatar, elements.plannerProfileAvatar];
    avatarTargets.forEach((target) => {
      if (target) {
        target.textContent = "";
        target.classList.remove("has-photo");
        if (avatarUrl) {
          const img = document.createElement("img");
          img.src = avatarUrl;
          img.alt = `Avatar ${userName}`;
          img.loading = "lazy";
          target.appendChild(img);
          target.classList.add("has-photo");
        } else {
          target.textContent = avatar;
        }
      }
    });

    renderAccountEditorPreview();
  }

  function getCurrentUserName() {
    if (authUser) {
      const metaName = String(
        authUser.user_metadata?.nickname || authUser.user_metadata?.full_name || authUser.user_metadata?.name || ""
      ).trim();
      if (metaName) {
        return metaName;
      }
      const email = String(authUser.email || "").trim();
      if (email) {
        return email.split("@")[0];
      }
    }
    return "Go??";
  }

  function getCurrentAvatarUrl() {
    if (!authUser) {
      return "";
    }
    const value = String(authUser.user_metadata?.avatar_url || "").trim();
    if (!value) {
      return "";
    }
    if (value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:image/")) {
      return value;
    }
    return "";
  }

  async function handleAuthSignIn() {
    if (!authClient) {
      alert("Najpierw ustaw Supabase URL i Anon Key w pliku supabase.config.js");
      return;
    }
    const email = String(elements.authEmailInput?.value || "").trim();
    const password = String(elements.authPasswordInput?.value || "").trim();
    if (!email || !password) {
      updateAuthStatus("Wpisz email i hasło.");
      if (elements.authStatus) elements.authStatus.classList.add("text-error");
      return;
    }
    const { error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      updateAuthStatus("Błąd: Nieprawidłowe dane logowania.");
      if (elements.authStatus) elements.authStatus.classList.add("text-error");
      return;
    }
    updateAuthStatus(`Zalogowano: ${email}`);
    if (elements.authStatus) elements.authStatus.classList.remove("text-error");
  }

  async function handleAuthRegister() {
    if (!authClient) {
      alert("Najpierw ustaw Supabase URL i Anon Key w pliku supabase.config.js");
      return;
    }
    const email = String(elements.authEmailInput?.value || "").trim();
    const password = String(elements.authPasswordInput?.value || "").trim();
    if (!email || !password) {
      updateAuthStatus("Wpisz email i hasło.");
      if (elements.authStatus) elements.authStatus.classList.add("text-error");
      return;
    }
    if (password.length < 6) {
      updateAuthStatus("Hasło musi mieć minimum 6 znaków.");
      if (elements.authStatus) elements.authStatus.classList.add("text-error");
      return;
    }
    const { error } = await authClient.auth.signUp({
      email,
      password
    });
    if (error) {
      updateAuthStatus("Błąd: Nie udało się utworzyć konta.");
      if (elements.authStatus) elements.authStatus.classList.add("text-error");
      return;
    }
    updateAuthStatus("Konto utworzone. Mo?esz si? zalogowa?.");
    if (elements.authStatus) elements.authStatus.classList.remove("text-error");
  }

  async function toggleAccountEditor() {
    if (!elements.accountEditor || !authUser) {
      return;
    }
    const isOpening = elements.accountEditor.hidden;
    elements.accountEditor.hidden = !elements.accountEditor.hidden;
    if (!isOpening) {
      return;
    }
    if (elements.accountNicknameInput) {
      elements.accountNicknameInput.value = getCurrentUserName();
    }
    if (elements.accountAvatarUrlInput) {
      elements.accountAvatarUrlInput.value = getCurrentAvatarUrl();
    }
    if (elements.accountHourlyRateInput) {
      elements.accountHourlyRateInput.value = profileState.hourlyRate > 0 ? profileState.hourlyRate.toFixed(2) : "";
    }
    if (elements.accountAvatarFileInput) {
      elements.accountAvatarFileInput.value = "";
    }
    if (elements.accountUnder26Toggle) {
      elements.accountUnder26Toggle.checked = Boolean(profileState.taxReliefUnder26);
    }
    renderAccountEditorPreview();
  }

  function closeAccountEditor() {
    if (elements.accountEditor) {
      elements.accountEditor.hidden = true;
    }
  }

  function renderAccountEditorPreview() {
    if (!elements.accountAvatarPreview) {
      return;
    }
    const previewName = String(elements.accountNicknameInput?.value || getCurrentUserName()).trim() || getCurrentUserName();
    const url = String(elements.accountAvatarUrlInput?.value || getCurrentAvatarUrl()).trim();
    elements.accountAvatarPreview.textContent = "";
    elements.accountAvatarPreview.classList.remove("has-photo");
    if (url && (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/"))) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = `Podglad ${previewName}`;
      img.loading = "lazy";
      elements.accountAvatarPreview.appendChild(img);
      elements.accountAvatarPreview.classList.add("has-photo");
      return;
    }
    elements.accountAvatarPreview.textContent = getInitials(previewName);
  }

  async function handleAccountSave() {
    if (!authClient || !authUser || !elements.accountSaveBtn) {
      return;
    }

    const saveButton = elements.accountSaveBtn;
    const originalButtonText = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "Zapisywanie...";

    try {
      const nextNick = String(elements.accountNicknameInput?.value || "").trim().slice(0, 24);
      const nextAvatarUrl = String(elements.accountAvatarUrlInput?.value || "").trim();
      const nextTaxReliefUnder26 = Boolean(elements.accountUnder26Toggle?.checked);
      const nextHourlyRate = Number(elements.accountHourlyRateInput?.value || 0);
      if (!nextNick) {
        alert("Nickname nie mo?e by? pusty.");
        return;
      }
      if (nextAvatarUrl && !(nextAvatarUrl.startsWith("https://") || nextAvatarUrl.startsWith("http://") || nextAvatarUrl.startsWith("data:image/"))) {
        alert("Podaj poprawny URL zdjecia lub wybierz plik.");
        return;
      }
      if (nextHourlyRate < 0) {
        alert("Stawka godzinowa nie może być ujemna.");
        return;
      }
      const { error } = await authClient.auth.updateUser({
        data: {
          ...(authUser.user_metadata || {}),
          nickname: nextNick,
          avatar_url: nextAvatarUrl
        }
      });
      if (error) {
        alert("Nie uda?o si? zapisa? danych konta.");
        return;
      }
      const { data } = await authClient.auth.getUser();
      authUser = data?.user || authUser;
      profileState.taxReliefUnder26 = nextTaxReliefUnder26;
      profileState.hourlyRate = nextHourlyRate > 0 ? nextHourlyRate : MINIMUM_HOURLY_RATE;
      persistProfileState();
      renderActiveUser();
      render();
      closeAccountEditor();
      updateAuthStatus(`Zapisano profil: ${nextNick}`);
    } catch (err) {
      console.error("Error saving account:", err);
      alert("Wystąpił nieoczekiwany błąd podczas zapisywania. Spróbuj ponownie.");
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = originalButtonText;
      }
    }
  }

  function handleAvatarFileChange(event) {
    const file = event.target?.files?.[0];
    if (!file) {
      return;
    }
    if (!String(file.type || "").startsWith("image/")) {
      alert("Wybierz plik graficzny.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (elements.accountAvatarUrlInput) {
        elements.accountAvatarUrlInput.value = dataUrl;
      }
      renderAccountEditorPreview();
    };
    reader.readAsDataURL(file);
  }

  async function handleAuthSignOut() {
    if (!authClient) {
      // offline mode logout
      setActiveUserId("guest_local");
      authUser = null;
      updateAuthStatus("Tryb lokalny (offline)");
      renderActiveUser();
      render();
      return;
    }
    try {
      await authClient.auth.signOut();
    } catch (err) {
      console.error("signOut error", err);
    }

    // make sure UI resets even if auth state change event doesn't fire
    const wasLoggedIn = !!authUser;
    authUser = null;
    if (wasLoggedIn) playLogoutSound();
    setActiveUserId("guest_local");
    updateAuthStatus("Wylogowano");
    setAuthGate(true);
    lastKnownLevel = null;
    loadEntries();
    loadProfileState();
    leaderboardRows = [];
    renderActiveUser();
    loadPlannerNotes().then(render);
    render();
    void renderLeaderboard(true);
  }

  async function loadCloudUserData() {
    if (!authClient || !authUser) {
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const { data, error } = await authClient.from(cloudTable).select("payload").eq("user_id", authUser.id).maybeSingle();
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        console.warn("loadCloudUserData timed out");
        return;
      }
      if (error || !data || !data.payload || typeof data.payload !== "object") {
        return;
      }

      const payload = data.payload;
      entries = Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry) : [];
      if (payload.profileState && typeof payload.profileState === "object") {
        profileState = createProfileState(payload.profileState);
      }

      localStorage.setItem(getEntriesStorageKey(), JSON.stringify(entries));
      localStorage.setItem(getProfileStateStorageKey(), JSON.stringify(profileState));
    } catch (err) {
      console.error("loadCloudUserData error", err);
    }
  }

  function scheduleCloudSync() {
    if (!authClient || !authUser) {
      return;
    }
    if (cloudSyncTimerId) {
      clearTimeout(cloudSyncTimerId);
    }
    cloudSyncTimerId = setTimeout(() => {
      cloudSyncTimerId = null;
      void persistCloudUserData();
    }, 700);
  }

  async function persistCloudUserData() {
    if (!authClient || !authUser) {
      return;
    }
    await authClient.from(cloudTable).upsert(
      {
        user_id: authUser.id,
        payload: { entries, profileState },
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
  }

  function scheduleLeaderboardSync(payload) {
    if (!authClient || !authUser) {
      return;
    }
    if (leaderboardSyncTimerId) {
      clearTimeout(leaderboardSyncTimerId);
    }
    leaderboardSyncTimerId = setTimeout(() => {
      leaderboardSyncTimerId = null;
      void persistLeaderboardSelf(payload);
    }, 900);
  }

  async function persistLeaderboardSelf(payload) {
    if (!authClient || !authUser || !payload) {
      return;
    }
    const safePayload = {
      user_id: authUser.id,
      nickname: String(payload.nickname || "U?ytkownik").slice(0, 48),
      level: Math.max(1, Number(payload.level) || 1),
      rank: String(payload.rank || "Bronze").slice(0, 48),
      rank_level: String(payload.rankLevel || "Bronze I").slice(0, 64),
      total_exp: Math.max(0, Math.floor(Number(payload.totalExp) || 0)),
      total_hours: Number(Math.max(0, Number(payload.totalHours) || 0).toFixed(2)),
      updated_at: new Date().toISOString()
    };
    await authClient.from(leaderboardTable).upsert(safePayload, { onConflict: "user_id" });
    void renderLeaderboard(true);
  }

  async function renderLeaderboard(force = false) {
    if (!elements.leaderboardBody || !elements.leaderboardStatus) {
      return;
    }
    if (!authClient || !authUser) {
      elements.leaderboardStatus.textContent = "Zaloguj si?, aby zobaczy? ranking.";
      elements.leaderboardBody.innerHTML = "";
      leaderboardRows = [];
      renderTeamUsers();
      return;
    }
    const now = Date.now();
    if (!force && now - leaderboardLastFetchAt < 30000) {
      return;
    }
    if (leaderboardLoading) {
      return;
    }

    leaderboardLoading = true;
    elements.leaderboardStatus.textContent = "Od?wie?anie rankingu...";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const { data, error } = await authClient
        .from(leaderboardTable)
        .select("user_id,nickname,level,rank,rank_level,total_exp,total_hours")
        .order("total_exp", { ascending: false })
        .order("level", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(30);
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        console.warn("renderLeaderboard timed out");
        elements.leaderboardStatus.textContent = "Brak dostępu do rankingu. Uruchom SQL dla leaderboardu.";
        leaderboardRows = [];
        renderTeamUsers();
        return;
      }

      if (error || !Array.isArray(data)) {
        elements.leaderboardStatus.textContent = "Brak dost?pu do rankingu. Uruchom SQL dla leaderboardu.";
        leaderboardRows = [];
        renderTeamUsers();
        return;
      }

      leaderboardRows = data;

      if (data.length === 0) {
        elements.leaderboardStatus.textContent = "Brak danych w rankingu.";
        elements.leaderboardBody.innerHTML = "";
        renderTeamUsers();
        return;
      }

      elements.leaderboardBody.innerHTML = data
        .map((row, index) => {
          const isSelf = row.user_id === authUser.id;
          const cls = isSelf ? "leaderboard-row is-self" : "leaderboard-row";
          const rankName = String(row.rank || "Bronze");
          const rankLabel = String(row.rank_level || rankName);
          const rankSlug = getRankSlug(rankName);
          return `
            <tr class="${cls}">
              <td>${index + 1}</td>
              <td>${escapeHtml(String(row.nickname || "U?ytkownik"))}</td>
              <td>${Number(row.level) || 1}</td>
              <td><span class="rank-edge-pill rank-edge-pill--${rankSlug}">${escapeHtml(rankLabel)}</span></td>
              <td>${Math.max(0, Math.floor(Number(row.total_exp) || 0))}</td>
              <td>${Number(row.total_hours || 0).toFixed(2)} h</td>
            </tr>
          `;
        })
        .join("");

      elements.leaderboardStatus.textContent = `Ranking aktywny: ${data.length} osob`;
      leaderboardLastFetchAt = now;
      renderTeamUsers();
    } finally {
      leaderboardLoading = false;
    }
  }

  function renderTeamUsers() {}

  function setDefaults(preferredDateIso) {
    const today = new Date();
    const fallbackIso = toIsoDate(today);
    const selectedIso = isIsoDateLike(preferredDateIso) ? preferredDateIso : fallbackIso;
    const [selY, selM, selD] = selectedIso.split("-").map(Number);
    const selectedDate = new Date(selY, selM - 1, selD);
    calendarViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    elements.todayDate.textContent = today.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    if (elements.workDate) {
      elements.workDate.value = selectedIso;
    }
    if (elements.workDateDisplayInput) {
      elements.workDateDisplayInput.value = selectedDate.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
    }
    elements.autoDateText.textContent = selectedDate.toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    updateWorkFieldDisplays();
  }

  function updateWorkFieldDisplays() {
    if (elements.workDateDisplay) {
      elements.workDateDisplay.textContent = formatWorkDateDisplay(elements.workDate?.value);
    }
    if (elements.startTimeDisplay) {
      elements.startTimeDisplay.textContent = formatWorkTimeDisplay(elements.startTime?.value);
    }
    if (elements.endTimeDisplay) {
      elements.endTimeDisplay.textContent = formatWorkTimeDisplay(elements.endTime?.value);
    }
  }

  function formatWorkDateDisplay(value) {
    if (!isIsoDateLike(value)) {
      return "--.--.----";
    }
    const [year, month, day] = String(value).split("-");
    return `${day}.${month}.${year}`;
  }

  function formatWorkTimeDisplay(value) {
    const raw = String(value || "").trim();
    return /^\d{2}:\d{2}$/.test(raw) ? raw : "--:--";
  }

  function bindEvents() {
    if (elements.authForm) {
      elements.authForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void handleAuthSignIn();
      });
    }
    if (elements.authRegisterBtn) {
      elements.authRegisterBtn.addEventListener("click", () => {
        void handleAuthRegister();
      });
    }
    if (elements.editNicknameBtn) {
      elements.editNicknameBtn.addEventListener("click", () => {
        void toggleAccountEditor();
      });
    }
    if (elements.accountSaveBtn) {
      elements.accountSaveBtn.addEventListener("click", () => {
        void handleAccountSave();
      });
    }
    if (elements.accountCancelBtn) {
      elements.accountCancelBtn.addEventListener("click", closeAccountEditor);
    }
    if (elements.accountCloseBtn) {
      elements.accountCloseBtn.addEventListener("click", closeAccountEditor);
    }
    if (elements.accountEditor) {
      elements.accountEditor.addEventListener("click", (event) => {
        if (event.target === elements.accountEditor) {
          closeAccountEditor();
        }
      });
    }
    if (elements.accountAvatarUrlInput) {
      elements.accountAvatarUrlInput.addEventListener("input", renderAccountEditorPreview);
    }
    if (elements.accountNicknameInput) {
      elements.accountNicknameInput.addEventListener("input", renderAccountEditorPreview);
    }
    if (elements.accountAvatarFileInput) {
      elements.accountAvatarFileInput.addEventListener("change", handleAvatarFileChange);
    }
    if (elements.accountFileTriggerBtn) {
      elements.accountFileTriggerBtn.addEventListener("click", () => {
        elements.accountAvatarFileInput?.click();
      });
    }
    if (elements.accountUnder26Toggle) {
      elements.accountUnder26Toggle.addEventListener("change", () => {
        if (navigator.vibrate) {
          navigator.vibrate(15);
        }
      });
    }
    if (elements.plannerForm) {
      elements.plannerForm.addEventListener("submit", (event) => {
        void handlePlannerSubmit(event);
      });
    }
    if (elements.plannerRefreshBtn) {
      elements.plannerRefreshBtn.addEventListener("click", () => {
        void loadPlannerNotes(true);
      });
    }
    if (elements.plannerCalendarPrevBtn) {
      elements.plannerCalendarPrevBtn.addEventListener("click", () => {
        plannerViewDate = new Date(plannerViewDate.getFullYear(), plannerViewDate.getMonth() - 1, 1);
        renderPlannerCalendar();
      });
    }
    if (elements.plannerCalendarNextBtn) {
      elements.plannerCalendarNextBtn.addEventListener("click", () => {
        plannerViewDate = new Date(plannerViewDate.getFullYear(), plannerViewDate.getMonth() + 1, 1);
        renderPlannerCalendar();
      });
    }
    if (elements.plannerCalendarGrid) {
      elements.plannerCalendarGrid.addEventListener("click", handlePlannerCalendarClick);
    }
    if (elements.plannerStartDateInput) {
      elements.plannerStartDateInput.addEventListener("change", () => {
        const nextDate = normalizePlannerDateValue(elements.plannerStartDateInput.value, plannerSelectedDate || getPlannerTodayIso());
        elements.plannerStartDateInput.value = nextDate;
        if (elements.plannerEndDateInput && (!elements.plannerEndDateInput.value || elements.plannerEndDateInput.value < nextDate)) {
          elements.plannerEndDateInput.value = nextDate;
          if (elements.plannerEndDateDisplay) {
             elements.plannerEndDateDisplay.value = new Date(nextDate).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
          }
        }
        plannerSelectedDate = nextDate;
        plannerViewDate = new Date(isoToDate(nextDate).getFullYear(), isoToDate(nextDate).getMonth(), 1);
        renderPlannerCalendar();
      });
    }
    if (elements.plannerEndDateInput) {
      elements.plannerEndDateInput.addEventListener("change", () => {
        const fallbackDate = elements.plannerStartDateInput?.value || plannerSelectedDate || getPlannerTodayIso();
        const nextDate = normalizePlannerDateValue(elements.plannerEndDateInput.value, fallbackDate);
        elements.plannerEndDateInput.value = nextDate;
        if (elements.plannerStartDateInput && elements.plannerStartDateInput.value && nextDate < elements.plannerStartDateInput.value) {
          elements.plannerStartDateInput.value = nextDate;
        }
      });
    }
    if (elements.plannerNotesList) {
      elements.plannerNotesList.addEventListener("click", (event) => {
        void handlePlannerBoardClick(event);
      });
    }
    if (elements.topbarLogoutBtn) {
      elements.topbarLogoutBtn.addEventListener("click", () => {
        void handleAuthSignOut();
      });
    }
    if (elements.iosInstallCloseBtn) {
      elements.iosInstallCloseBtn.addEventListener("click", () => {
        if (elements.iosInstallModal) elements.iosInstallModal.hidden = true;
      });
    }
    if (elements.monthCalendar) {
      elements.monthCalendar.addEventListener("click", handleCalendarDayClick);
    }
    if (elements.dayInfoModal) {
      elements.dayInfoModal.addEventListener("click", (event) => {
        if (event.target === elements.dayInfoModal) {
          elements.dayInfoModal.hidden = true;
        }
      });
    }
    if (elements.dayInfoModalCloseBtn) {
      elements.dayInfoModalCloseBtn.addEventListener("click", () => {
        if (elements.dayInfoModal) elements.dayInfoModal.hidden = true;
      });
    }
    if (elements.authPasswordInput) {
      elements.authPasswordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void handleAuthSignIn();
        }
      });
    }
    elements.navViewButtons.forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });
    elements.form.addEventListener("submit", handleSubmit);
    if (elements.workDate) {
      elements.workDate.addEventListener("change", () => {
        setDefaults(elements.workDate.value);
      });
    }
    if (elements.startTime) {
      elements.startTime.addEventListener("input", updateWorkFieldDisplays);
      elements.startTime.addEventListener("change", updateWorkFieldDisplays);
    }
    if (elements.endTime) {
      elements.endTime.addEventListener("input", updateWorkFieldDisplays);
      elements.endTime.addEventListener("change", updateWorkFieldDisplays);
    }
    elements.clearAllBtn.addEventListener("click", clearAllEntries);
    elements.list.addEventListener("click", handleListClick);
    elements.toggleSidebar.addEventListener("click", toggleSidebar);
    if (elements.quickTags) {
      elements.quickTags.addEventListener("click", handleTagClick);
    }
    elements.entryFormPanel.addEventListener("click", handlePresetClick);
    elements.timerStartBtn.addEventListener("click", handleTimerStart);
    elements.timerPauseBtn.addEventListener("click", handleTimerPauseResume);
    elements.timerStopBtn.addEventListener("click", handleTimerStop);
    if (elements.calendarAddBtn) {
      elements.calendarAddBtn.addEventListener("click", openCalendarEventModal);
    }
    if (elements.calendarPrevBtn) {
      elements.calendarPrevBtn.addEventListener("click", () => shiftCalendarMonth(-1));
    }
    if (elements.calendarNextBtn) {
      elements.calendarNextBtn.addEventListener("click", () => shiftCalendarMonth(1));
    }
    if (elements.earningsPrevBtn) {
      elements.earningsPrevBtn.addEventListener("click", () => shiftEarningsMonth(-1));
    }
    if (elements.earningsNextBtn) {
      elements.earningsNextBtn.addEventListener("click", () => shiftEarningsMonth(1));
    }
    if (elements.calendarEventSaveBtn) {
      elements.calendarEventSaveBtn.addEventListener("click", handleSaveCalendarEvent);
    }
    if (elements.calendarEventCancelBtn) {
      elements.calendarEventCancelBtn.addEventListener("click", closeCalendarEventModal);
    }
    if (elements.calendarEventModal) {
      elements.calendarEventModal.addEventListener("click", (event) => {
        if (event.target === elements.calendarEventModal) {
          closeCalendarEventModal();
        }
      });
    }
    document.addEventListener("click", handleOutsideSidebarClick);
    document.addEventListener("keydown", handleGlobalKeydown);
  }

  function initDatePickers() {
    if (typeof window.Litepicker !== "function") {
      return;
    }

    const commonConfig = {
      autoApply: true,
      format: "YYYY-MM-DD",
      lang: "pl-PL",
      dropdowns: { minYear: 2020, maxYear: 2035, months: true, years: true },
      mobileFriendly: true
    };

    if (elements.calendarEventFrom && elements.calendarEventTo) {
      new window.Litepicker({
        element: elements.calendarEventFrom,
        elementEnd: elements.calendarEventTo,
        singleMode: false,
        autoApply: true,
        format: "YYYY-MM-DD",
        numberOfMonths: 1,
        numberOfColumns: 1,
        lang: "pl-PL",
        dropdowns: { minYear: 2020, maxYear: 2035, months: true, years: true },
        mobileFriendly: true
      });
    }

    if (elements.workDate) {
      new window.Litepicker({
        element: elements.workDate,
        singleMode: true,
        ...commonConfig,
        setup: (picker) => {
          picker.on('selected', () => {
            elements.workDate.dispatchEvent(new Event('change'));
          });
        }
      });
    }

    if (elements.plannerStartDateInput && elements.plannerEndDateInput) {
      new window.Litepicker({
        element: elements.plannerStartDateInput,
        elementEnd: elements.plannerEndDateInput,
        singleMode: false,
        ...commonConfig,
        setup: (picker) => {
          picker.on('selected', () => {
            elements.plannerStartDateInput.dispatchEvent(new Event('change'));
            elements.plannerEndDateInput.dispatchEvent(new Event('change'));
          });
        }
      });
    }
  }

  function initTimePickers() {
    if (typeof window.MobileSelect === "undefined") {
      return;
    }

    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

    const targets = [
      { id: "startTime", title: "Godzina rozpoczęcia" },
      { id: "endTime", title: "Godzina zakończenia" }
    ];

    targets.forEach(({ id, title }) => {
      const el = document.getElementById(id);
      if (!el) return;

      // Ensure default value
      if (!el.value) el.value = id === "startTime" ? "08:00" : "16:00";
      const [initH, initM] = el.value.split(":");

      new window.MobileSelect({
        trigger: el,
        title: title,
        wheels: [
          { data: hours },
          { data: minutes }
        ],
        initValue: [initH || "08", initM || "00"],
        onTransitionEnd: function() {
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        },
        callback: function(indexArr, data) {
          // data is array of selected values e.g. ['08', '30']
          el.value = `${data[0]}:${data[1]}`;
          el.dispatchEvent(new Event("input"));
          el.dispatchEvent(new Event("change"));
        }
      });
    });
  }

  function initCalendarEventForm() {
    if (elements.calendarEventModal) {
      elements.calendarEventModal.hidden = true;
    }
    if (elements.calendarEventType) {
      elements.calendarEventType.value = "vacation";
    }
  }

  function openCalendarEventModal() {
    if (!elements.calendarEventModal) {
      return;
    }
    elements.calendarEventModal.hidden = false;
    const todayIso = toIsoDate(new Date());
    if (elements.calendarEventFrom && !elements.calendarEventFrom.value) {
      elements.calendarEventFrom.value = todayIso;
      if (elements.calendarEventFromDisplay) {
         elements.calendarEventFromDisplay.value = new Date(todayIso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      }
    }
    if (elements.calendarEventTo && !elements.calendarEventTo.value) {
      elements.calendarEventTo.value = todayIso;
      if (elements.calendarEventToDisplay) {
         elements.calendarEventToDisplay.value = new Date(todayIso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      }
    }
  }

  function closeCalendarEventModal() {
    if (!elements.calendarEventModal) {
      return;
    }
    elements.calendarEventModal.hidden = true;
  }

  function shiftCalendarMonth(delta) {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
    renderMonthCalendar();
  }

  function shiftEarningsMonth(delta) {
    const newDate = new Date(earningsViewDate.getFullYear(), earningsViewDate.getMonth() + delta, 1);
    const today = new Date();
    // Don't allow going into the future
    if (newDate.getFullYear() > today.getFullYear() || (newDate.getFullYear() === today.getFullYear() && newDate.getMonth() > today.getMonth())) {
      return;
    }
    earningsViewDate = newDate;
    render();
  }

  function handleSaveCalendarEvent() {
    if (!elements.calendarEventFrom || !elements.calendarEventTo || !elements.calendarEventType) {
      return;
    }

    const startIso = elements.calendarEventFrom.value;
    const endIso = elements.calendarEventTo.value;
    const type = elements.calendarEventType.value;
    if (!isIsoDateLike(startIso) || !isIsoDateLike(endIso)) {
      alert("Wybierz poprawny zakres dat.");
      return;
    }
    if (startIso > endIso) {
      alert("Data pocz?tkowa nie mo?e by? p??niej ni? ko?cowa.");
      return;
    }

    const fieldMap = {
      vacation: "vacationDays",
      off: "offDays",
      l4: "sickDays",
      absent: "absentDays"
    };
    const targetField = fieldMap[type] || "vacationDays";
    const daySet = new Set(profileState[targetField] || []);
    let cursor = startIso;
    while (cursor <= endIso) {
      daySet.add(cursor);
      cursor = addDaysToIso(cursor, 1);
    }
    profileState[targetField] = [...daySet].sort();
    persistProfileState();
    closeCalendarEventModal();
    render();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const record = createRecordFromManualForm();

    if (!record) {
      alert("Godzina zako?czenia musi by? p??niejsza ni? rozpocz?cia.");
      return;
    }

    addEntry(record);
    const chosenDate = elements.workDate ? elements.workDate.value : "";
    elements.form.reset();
    setDefaults(chosenDate);
    clearTagSelection();
    elements.startTime.focus();
  }

  function createRecordFromManualForm() {
    const date = elements.workDate ? String(elements.workDate.value || "").trim() : toIsoDate(new Date());
    const start = elements.startTime.value;
    const end = elements.endTime.value;
    const durationMinutes = getDurationMinutes(start, end);

    if (!isIsoDateLike(date) || !start || !end || durationMinutes <= 0) {
      return null;
    }

    return buildEntry(date, start, end, durationMinutes, "manual");
  }

  function getDurationMinutes(start, end) {
    const [sH, sM] = start.split(":").map(Number);
    const [eH, eM] = end.split(":").map(Number);
    const startMinutes = sH * 60 + sM;
    const endMinutes = eH * 60 + eM;
    return Math.max(0, endMinutes - startMinutes);
  }

  function buildEntry(date, start, end, durationMinutes, source = "manual") {
    return {
      id: generateId(),
      date,
      start,
      end,
      source,
      durationMinutes,
      hours: Number((durationMinutes / 60).toFixed(2))
    };
  }

  function normalizeEntry(entry) {
    const minutes = Number.isFinite(entry.durationMinutes)
      ? Math.max(0, Math.round(entry.durationMinutes))
      : getDurationMinutes(entry.start, entry.end);
    let source = String(entry.source || "").trim().toLowerCase();
    if (!source) {
      const noteValue = String(entry.note || "").toLowerCase();
      source = noteValue.includes("timer") ? "timer" : "manual";
    }
    return {
      ...entry,
      source,
      durationMinutes: minutes,
      hours: Number((minutes / 60).toFixed(2))
    };
  }

  function addEntry(entry) {
    entries.unshift(entry);
    persistEntries();
    render();
  }

  function withSelectedTag(note) {
    if (!selectedTag) {
      return note;
    }
    if (note === selectedTag || note.startsWith(`${selectedTag} |`)) {
      return note;
    }
    if (!note) {
      return selectedTag;
    }
    return `${selectedTag} | ${note}`;
  }

  function clearTagSelection() {
    selectedTag = "";
    if (!elements.quickTags) {
      return;
    }
    const buttons = elements.quickTags.querySelectorAll(".tag-btn");
    buttons.forEach((button) => button.classList.remove("is-active"));
  }

  function handleTagClick(event) {
    const button = event.target.closest(".tag-btn");
    if (!button) {
      return;
    }

    const nextTag = button.dataset.tag;
    if (selectedTag === nextTag) {
      clearTagSelection();
      return;
    }

    selectedTag = nextTag;
    if (!elements.quickTags) {
      return;
    }
    const buttons = elements.quickTags.querySelectorAll(".tag-btn");
    buttons.forEach((item) => item.classList.toggle("is-active", item === button));
    if (elements.note && !elements.note.value.trim()) {
      elements.note.value = selectedTag;
    }
  }

  function handlePresetClick(event) {
    const button = event.target.closest(".quick-btn");
    if (!button) {
      return;
    }

    const minutes = Number(button.dataset.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    addQuickEntry(minutes);
  }

  function addQuickEntry(minutes) {
    const now = new Date();
    const date = toIsoDate(now);
    const endTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const durationMinutes = Math.max(1, Math.min(minutes, endTotalMinutes));
    const startTotalMinutes = endTotalMinutes - durationMinutes;
    const start = formatMinutesToTime(startTotalMinutes);
    const end = formatMinutesToTime(endTotalMinutes);
    const entry = buildEntry(date, start, end, durationMinutes, "quick");
    addEntry(entry);
  }

  function cloneLastEntry() {
    if (entries.length === 0) {
      alert("Brak wpisu do powielenia.");
      return;
    }
    const lastEntry = entries[0];
    const minutes = getEntryDurationMinutes(lastEntry);
    const now = new Date();
    const date = toIsoDate(now);
    const endTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const durationMinutes = Math.max(1, Math.min(minutes, endTotalMinutes));
    const startTotalMinutes = endTotalMinutes - durationMinutes;
    const entry = buildEntry(
      date,
      formatMinutesToTime(startTotalMinutes),
      formatMinutesToTime(endTotalMinutes),
      durationMinutes,
      "clone"
    );
    addEntry(entry);
  }

  function handleTimerStart() {
    if (timerState.running) {
      return;
    }
    timerState.running = true;
    timerState.startedAt = Date.now();
    timerState.pausedMs = 0;
    timerState.pauseStartedAt = 0;
    timerState.reminderShown = false;
    timerState.tickIntervalId = setInterval(updateTimerView, 1000);
    updateTimerView();
    updateTimerControls();
    persistTimerState();
  }

  function handleTimerPauseResume() {
    if (!timerState.running) {
      return;
    }
    if (timerState.pauseStartedAt) {
      timerState.pausedMs += Date.now() - timerState.pauseStartedAt;
      timerState.pauseStartedAt = 0;
    } else {
      timerState.pauseStartedAt = Date.now();
    }
    updateTimerView();
    updateTimerControls();
    persistTimerState();
  }

  function handleTimerStop() {
    if (!timerState.running) {
      return;
    }

    const nowMs = Date.now();
    const elapsedMs = getTimerActiveMs(nowMs);
    const workedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
    const now = new Date(nowMs);
    const endTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const durationMinutes = Math.max(1, Math.min(workedMinutes, endTotalMinutes));
    const startTotalMinutes = endTotalMinutes - durationMinutes;
    const entry = buildEntry(
      toIsoDate(now),
      formatMinutesToTime(startTotalMinutes),
      formatMinutesToTime(endTotalMinutes),
      durationMinutes,
      "timer"
    );

    resetTimerState();
    addEntry(entry);
    updateTimerView();
    updateTimerControls();
    persistTimerState();
  }

  function resetTimerState() {
    timerState.running = false;
    timerState.startedAt = 0;
    timerState.pausedMs = 0;
    timerState.pauseStartedAt = 0;
    timerState.reminderShown = false;
    if (timerState.tickIntervalId) {
      clearInterval(timerState.tickIntervalId);
      timerState.tickIntervalId = null;
    }
  }

  function loadTimerState() {
    try {
      const raw = localStorage.getItem(timerStorageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          timerState.running = Boolean(saved.running);
          timerState.startedAt = Number(saved.startedAt) || 0;
          timerState.pausedMs = Number(saved.pausedMs) || 0;
          timerState.pauseStartedAt = Number(saved.pauseStartedAt) || 0;
          timerState.reminderShown = Boolean(saved.reminderShown);

          if (timerState.running && !timerState.pauseStartedAt) {
            if (timerState.tickIntervalId) clearInterval(timerState.tickIntervalId);
            timerState.tickIntervalId = setInterval(updateTimerView, 1000);
          }
        }
      }
    } catch (e) {
      console.error("Timer state load error", e);
    }
  }

  function persistTimerState() {
    const stateToSave = {
      running: timerState.running,
      startedAt: timerState.startedAt,
      pausedMs: timerState.pausedMs,
      pauseStartedAt: timerState.pauseStartedAt,
      reminderShown: timerState.reminderShown
    };
    localStorage.setItem(timerStorageKey, JSON.stringify(stateToSave));
  }

  function getTimerActiveMs(nowMs = Date.now()) {
    if (!timerState.running) {
      return 0;
    }
    const currentPauseMs = timerState.pauseStartedAt ? nowMs - timerState.pauseStartedAt : 0;
    return Math.max(0, nowMs - timerState.startedAt - timerState.pausedMs - currentPauseMs);
  }

  function updateTimerView() {
    const elapsedMs = getTimerActiveMs();
    const hours = Math.floor(elapsedMs / 3600000);
    const minutes = Math.floor((elapsedMs % 3600000) / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    elements.timerDisplay.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (!timerState.running) {
      elements.timerStatus.textContent = "Timer nieaktywny";
      return;
    }
    if (timerState.pauseStartedAt) {
      const sessionExp = Math.floor(calculateExpFromMinutes(elapsedMs / 60000));
      elements.timerStatus.textContent = `Timer wstrzymany | +${sessionExp} EXP`;
    } else {
      const sessionExp = Math.floor(calculateExpFromMinutes(elapsedMs / 60000));
      elements.timerStatus.textContent = `Timer aktywny | +${sessionExp} EXP`;
    }

    renderLiveProgress();

    if (!timerState.reminderShown && elapsedMs >= AUTO_REMINDER_MINUTES * 60000) {
      timerState.reminderShown = true;
      alert("Przypomnienie: timer dziala ju? 2 godziny. Zrob przerw? lub zako?cz wpis.");
    }
  }

  function updateTimerControls() {
    elements.timerStartBtn.disabled = timerState.running;
    elements.timerPauseBtn.disabled = !timerState.running;
    elements.timerStopBtn.disabled = !timerState.running;
    elements.timerPauseBtn.textContent = timerState.pauseStartedAt ? "Wznów" : "Pauza";
  }

  function handleListClick(event) {
    const removeButton = event.target.closest(".entries-v3-remove");
    if (removeButton) {
      const id = removeButton.dataset.id;
      entries = entries.filter((entry) => entry.id !== id);
      persistEntries();
      render();
      return;
    }
  }

  function clearAllEntries() {
    if (entries.length === 0) {
      return;
    }
    const confirmed = confirm("Na pewno usunac wszystkie wpisy?");
    if (!confirmed) {
      return;
    }
    entries = [];
    persistEntries();
    render();
  }

  async function loadPlannerNotes(forceRemote = false) {
    plannerNotes = loadPlannerNotesLocal();
    plannerCloudEnabled = false;
    plannerSelectedDate = normalizePlannerDateValue(plannerSelectedDate, getPlannerTodayIso());

    if (!authClient || !authUser) {
      updatePlannerStatus("Tryb lokalny. Zadania są widoczne tylko na tym urządzeniu.");
      renderPlannerNotes();
      renderPlannerCalendar();
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const { data, error } = await authClient
        .from(plannerTable)
        .select("id,author_user_id,author_name,title,content,is_pinned,start_date,end_date,created_at,updated_at")
        .order("is_pinned", { ascending: false })
        .order("start_date", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(160);
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        console.warn("loadPlannerNotes timed out");
        if (forceRemote) {
          updatePlannerStatus("Planer działa lokalnie. Aby współdzielić zadania z kalendarzem, uruchom zaktualizowany SQL planera w Supabase.");
        } else {
          updatePlannerStatus("Nie udało się pobrać wspólnego planera. Pokazuję lokalne zadania.");
        }
        renderPlannerNotes();
        renderPlannerCalendar();
        return;
      }

      if (error || !Array.isArray(data)) {
        if (forceRemote) {
          updatePlannerStatus("Planer działa lokalnie. Aby współdzielić zadania z kalendarzem, uruchom zaktualizowany SQL planera w Supabase.");
        } else {
          updatePlannerStatus("Nie udało się pobrać wspólnego planera. Pokazuję lokalne zadania.");
        }
        renderPlannerNotes();
        renderPlannerCalendar();
        return;
      }

      plannerCloudEnabled = true;
      plannerNotes = sortPlannerNotes(data.map(normalizePlannerNote));
      persistPlannerNotesLocal();
      updatePlannerStatus(`Wspólny planer aktywny. Zadań: ${plannerNotes.length}.`);
      renderPlannerNotes();
      renderPlannerCalendar();
    } catch {
      updatePlannerStatus("Błąd połączenia z planerem. Pokazuję lokalne zadania.");
      renderPlannerNotes();
      renderPlannerCalendar();
    }
  }

  function loadPlannerNotesLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(plannerLocalKey));
      return sortPlannerNotes(Array.isArray(raw) ? raw.map(normalizePlannerNote) : []);
    } catch {
      return [];
    }
  }

  function persistPlannerNotesLocal() {
    localStorage.setItem(plannerLocalKey, JSON.stringify(plannerNotes));
  }

  function normalizePlannerNote(note) {
    const createdAt = String(note.created_at || note.createdAt || new Date().toISOString());
    const fallbackDate = normalizePlannerDateValue(createdAt, getPlannerTodayIso());
    const rawStartDate = note.start_date ?? note.startDate ?? fallbackDate;
    const rawEndDate = note.end_date ?? note.endDate ?? rawStartDate;
    const startDate = normalizePlannerDateValue(rawStartDate, fallbackDate);
    const endDateCandidate = normalizePlannerDateValue(rawEndDate, startDate);
    const safeStartDate = startDate <= endDateCandidate ? startDate : endDateCandidate;
    const safeEndDate = startDate <= endDateCandidate ? endDateCandidate : startDate;
    return {
      id: String(note.id || generateId()),
      authorUserId: String(note.author_user_id || note.authorUserId || activeUserId || "guest_local"),
      authorName: String(note.author_name || note.authorName || "Użytkownik").trim() || "Użytkownik",
      title: String(note.title || "").trim() || "Bez tytułu",
      content: String(note.content || "").trim(),
      isPinned: Boolean(note.is_pinned ?? note.isPinned),
      startDate: safeStartDate,
      endDate: safeEndDate,
      createdAt,
      updatedAt: String(note.updated_at || note.updatedAt || createdAt)
    };
  }

  function sortPlannerNotes(notes) {
    const todayIso = getPlannerTodayIso();
    return [...notes].sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }

      const aBucket = getPlannerSortBucket(a, todayIso);
      const bBucket = getPlannerSortBucket(b, todayIso);
      if (aBucket !== bBucket) {
        return aBucket - bBucket;
      }

      if (aBucket === 2) {
        const byPastEnd = String(b.endDate).localeCompare(String(a.endDate));
        if (byPastEnd !== 0) {
          return byPastEnd;
        }
      } else {
        const byStart = String(a.startDate).localeCompare(String(b.startDate));
        if (byStart !== 0) {
          return byStart;
        }
      }

      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  async function handlePlannerSubmit(event) {
    event.preventDefault();
    const title = String(elements.plannerTitleInput?.value || "").trim();
    const startDate = normalizePlannerDateValue(elements.plannerStartDateInput?.value, plannerSelectedDate || getPlannerTodayIso());
    const endDate = normalizePlannerDateValue(elements.plannerEndDateInput?.value, startDate);
    const content = String(elements.plannerContentInput?.value || "").trim();
    const isPinned = Boolean(elements.plannerPinnedInput?.checked);

    if (!title || !content) {
      alert("Uzupełnij tytuł i szczegóły zadania.");
      return;
    }

    if (endDate < startDate) {
      alert("Data końcowa nie może być wcześniejsza niż data początkowa.");
      return;
    }

    const authorName = getCurrentUserName();
    plannerSelectedDate = startDate;
    plannerViewDate = new Date(isoToDate(startDate).getFullYear(), isoToDate(startDate).getMonth(), 1);
    if (authClient && authUser) {
      try {
        const { error } = await authClient.from(plannerTable).insert({
          author_user_id: authUser.id,
          author_name: authorName,
          title: title.slice(0, 80),
          content,
          is_pinned: isPinned,
          start_date: startDate,
          end_date: endDate
        });
        if (!error) {
          resetPlannerForm();
          await loadPlannerNotes(true);
          return;
        }
      } catch {
        // fallback local below
      }
    }

    const localNote = normalizePlannerNote({
      id: generateId(),
      author_user_id: authUser?.id || activeUserId,
      author_name: authorName,
      title: title.slice(0, 80),
      content,
      is_pinned: isPinned,
      start_date: startDate,
      end_date: endDate,
      created_at: new Date().toISOString()
    });
    plannerNotes = sortPlannerNotes([localNote, ...plannerNotes]);
    persistPlannerNotesLocal();
    resetPlannerForm();
    updatePlannerStatus("Zadanie zapisane lokalnie.");
    renderPlannerNotes();
    renderPlannerCalendar();
  }

  function resetPlannerForm() {
    if (elements.plannerForm) {
      elements.plannerForm.reset();
    }
    const defaultDate = normalizePlannerDateValue(plannerSelectedDate, getPlannerTodayIso());
    if (elements.plannerStartDateInput) {
      elements.plannerStartDateInput.value = defaultDate;
      if (elements.plannerStartDateDisplay) {
         elements.plannerStartDateDisplay.value = new Date(defaultDate).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      }
    }
    if (elements.plannerEndDateInput) {
      elements.plannerEndDateInput.value = defaultDate;
      if (elements.plannerEndDateDisplay) {
         elements.plannerEndDateDisplay.value = new Date(defaultDate).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      }
    }
    if (elements.plannerPinnedInput) {
      elements.plannerPinnedInput.checked = false;
    }
  }

  async function handlePlannerBoardClick(event) {
    const deleteButton = event.target.closest(".planner-note__delete");
    if (!deleteButton) {
      return;
    }

    const noteId = deleteButton.dataset.id;
    const note = plannerNotes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }
    if (!canDeletePlannerNote(note)) {
      alert("Możesz usuwać tylko swoje notatki.");
      return;
    }

    if (authClient && authUser && plannerCloudEnabled) {
      try {
        const { error } = await authClient
          .from(plannerTable)
          .delete()
          .eq("id", note.id)
          .eq("author_user_id", authUser.id);
        if (!error) {
          await loadPlannerNotes(true);
          return;
        }
      } catch {
        // fallback local below
      }
    }

    plannerNotes = plannerNotes.filter((item) => item.id !== noteId);
    persistPlannerNotesLocal();
    updatePlannerStatus("Usunięto zadanie z lokalnego planera.");
    renderPlannerNotes();
    renderPlannerCalendar();
  }

  function canDeletePlannerNote(note) {
    if (authUser) {
      return note.authorUserId === authUser.id;
    }
    return note.authorUserId === activeUserId || note.authorUserId === "guest_local";
  }

  function renderPlannerNotes() {
    if (!elements.plannerNotesList) {
      return;
    }

    if (plannerNotes.length === 0) {
      elements.plannerNotesList.innerHTML = `
        <li class="planner-empty">
          Brak zadań w planerze. Dodaj pierwsze zadanie do kalendarza.
        </li>
      `;
      return;
    }

    elements.plannerNotesList.innerHTML = plannerNotes
      .map((note) => {
        const canDelete = canDeletePlannerNote(note);
        const phase = getPlannerNotePhase(note);
        const rangeLabel = formatPlannerRangeLabel(note.startDate, note.endDate);
        const durationLabel = formatPlannerDurationDays(getPlannerDurationDays(note));
        const isCalendarMatch =
          Boolean(plannerHighlightedDate) &&
          note.startDate <= plannerHighlightedDate &&
          note.endDate >= plannerHighlightedDate;
        return `
          <li class="planner-note ${note.isPinned ? "is-pinned" : ""}${isCalendarMatch ? " is-calendar-match" : ""}" data-note-id="${note.id}">
            <div class="planner-note__top">
              <div class="planner-note__head">
                <strong>${escapeHtml(note.title)}</strong>
                <p class="planner-note__meta">${escapeHtml(note.authorName)} • ${escapeHtml(rangeLabel)} • ${escapeHtml(durationLabel)}</p>
              </div>
              <div class="planner-note__actions">
                ${note.isPinned ? '<span class="planner-note__badge">Ważne</span>' : ""}
                <span class="planner-note__phase planner-note__phase--${phase.slug}">${escapeHtml(phase.label)}</span>
                ${canDelete ? `<button type="button" class="planner-note__delete" data-id="${note.id}">Usuń</button>` : ""}
              </div>
            </div>
            <p class="planner-note__content">${escapeHtml(note.content).replace(/\n/g, "<br>")}</p>
            <p class="planner-note__footer">Dodano ${escapeHtml(formatPlannerDateTime(note.createdAt))}</p>
          </li>
        `;
      })
      .join("");

    if (plannerPendingScrollToMatch) {
      plannerPendingScrollToMatch = false;
      requestAnimationFrame(scrollPlannerBoardToMatch);
    }
  }

  function renderPlannerCalendar() {
    if (!elements.plannerCalendarGrid) {
      return;
    }

    plannerSelectedDate = normalizePlannerDateValue(plannerSelectedDate, getPlannerTodayIso());
    const viewYear = plannerViewDate.getFullYear();
    const viewMonth = plannerViewDate.getMonth();
    const firstDay = new Date(viewYear, viewMonth, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - firstWeekday);
    const todayIso = getPlannerTodayIso();

    if (elements.plannerCalendarMonthLabel) {
      const label = plannerViewDate.toLocaleDateString("pl-PL", {
        month: "long",
        year: "numeric"
      });
      elements.plannerCalendarMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }

    const headers = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"]
      .map((label) => `<div class="planner-calendar-grid__head">${label}</div>`)
      .join("");

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const currentDate = new Date(gridStart);
      currentDate.setDate(gridStart.getDate() + i);
      const iso = toIsoDate(currentDate);
      const tasks = getPlannerNotesForDate(iso);
      const isOutsideMonth = currentDate.getMonth() !== viewMonth;
      const isToday = iso === todayIso;
      const isSelected = iso === plannerSelectedDate;
      cells.push(`
        <button
          type="button"
          class="planner-calendar-cell${isOutsideMonth ? " is-outside" : ""}${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${tasks.length ? " has-tasks" : ""}"
          data-date="${iso}"
        >
          <span class="planner-calendar-cell__top">
            <span class="planner-calendar-cell__day">${currentDate.getDate()}</span>
          </span>
          ${tasks.length ? '<span class="planner-calendar-cell__marker" aria-hidden="true"></span>' : ""}
        </button>
      `);
    }

    elements.plannerCalendarGrid.innerHTML = `${headers}${cells.join("")}`;
    renderPlannerDayAgenda();
  }

  function renderPlannerDayAgenda() {
    if (!elements.plannerDayAgenda) {
      return;
    }

    const selectedIso = normalizePlannerDateValue(plannerSelectedDate, getPlannerTodayIso());
    const tasks = getPlannerNotesForDate(selectedIso);

    if (elements.plannerSelectedDateLabel) {
      elements.plannerSelectedDateLabel.textContent = formatPlannerDayLabel(selectedIso);
    }
    if (elements.plannerSelectedDateMeta) {
      elements.plannerSelectedDateMeta.textContent = tasks.length
        ? `${tasks.length} ${tasks.length === 1 ? "zadanie" : "zadań"}`
        : "Brak zadań";
    }

    if (tasks.length === 0) {
      elements.plannerDayAgenda.innerHTML = `
        <li class="planner-day-empty">
          Na ten dzień nie ma jeszcze żadnych zadań.
        </li>
      `;
      return;
    }

    elements.plannerDayAgenda.innerHTML = tasks
      .map((task) => {
        const phase = getPlannerNotePhase(task, selectedIso);
        return `
          <li class="planner-day-item">
            <div class="planner-day-item__top">
              <strong>${escapeHtml(task.title)}</strong>
              <span class="planner-day-item__range">${escapeHtml(formatPlannerRangeLabel(task.startDate, task.endDate))}</span>
            </div>
            <p class="planner-day-item__content">${escapeHtml(task.content).replace(/\n/g, "<br>")}</p>
            <div class="planner-day-item__meta">
              ${task.isPinned ? '<span class="planner-day-item__badge">Ważne</span>' : ""}
              <span class="planner-note__phase planner-note__phase--${phase.slug}">${escapeHtml(phase.label)}</span>
            </div>
          </li>
        `;
      })
      .join("");
  }

  function handlePlannerCalendarClick(event) {
    const button = event.target.closest(".planner-calendar-cell");
    if (!button) {
      return;
    }

    const date = String(button.dataset.date || "");
    if (!isIsoDateLike(date)) {
      return;
    }

    plannerSelectedDate = date;
    plannerHighlightedDate = getPlannerNotesForDate(date).length ? date : "";
    plannerPendingScrollToMatch = Boolean(plannerHighlightedDate);
    if (elements.plannerTitleInput && !String(elements.plannerTitleInput.value || "").trim() && elements.plannerStartDateInput) {
      elements.plannerStartDateInput.value = date;
      if (elements.plannerEndDateInput && (!elements.plannerEndDateInput.value || elements.plannerEndDateInput.value < date)) {
        elements.plannerEndDateInput.value = date;
        if (elements.plannerEndDateDisplay) {
           elements.plannerEndDateDisplay.value = new Date(date).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
        }
      }
      if (elements.plannerStartDateDisplay) {
         elements.plannerStartDateDisplay.value = new Date(date).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
      }
    }
    renderPlannerCalendar();
    renderPlannerNotes();
  }

  function formatPlannerDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "-";
    }
    return date.toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function normalizePlannerDateValue(value, fallbackIso) {
    if (isIsoDateLike(value)) {
      return String(value);
    }
    const parsed = parseEntryDate(value);
    if (parsed) {
      return toIsoDate(parsed);
    }
    return normalizePlannerDateValue(fallbackIso || getPlannerTodayIso(), getPlannerTodayIso());
  }

  function getPlannerTodayIso() {
    return toIsoDate(new Date());
  }

  function getPlannerSortBucket(note, todayIso) {
    if (note.startDate <= todayIso && note.endDate >= todayIso) {
      return 0;
    }
    if (note.startDate > todayIso) {
      return 1;
    }
    return 2;
  }

  function getPlannerDurationDays(note) {
    return Math.max(1, daysBetweenIso(note.startDate, note.endDate) + 1);
  }

  function formatPlannerDurationDays(days) {
    return `${days} ${days === 1 ? "dzień" : "dni"}`;
  }

  function formatPlannerRangeLabel(startIso, endIso) {
    if (startIso === endIso) {
      return formatPlannerDate(startIso);
    }
    return `${formatPlannerDate(startIso)} - ${formatPlannerDate(endIso)}`;
  }

  function formatPlannerDate(value) {
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "short"
    }).format(isoToDate(value));
  }

  function formatPlannerDayLabel(value) {
    const date = isoToDate(value);
    const label = date.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function getPlannerNotePhase(note, referenceIso = getPlannerTodayIso()) {
    if (note.endDate < referenceIso) {
      return { slug: "past", label: "Zakończone" };
    }
    if (note.startDate > referenceIso) {
      return { slug: "upcoming", label: "Nadchodzi" };
    }
    if (note.startDate === note.endDate && note.startDate === referenceIso) {
      return { slug: "today", label: "Na dziś" };
    }
    return { slug: "active", label: "W toku" };
  }

  function getPlannerNotesForDate(iso) {
    return sortPlannerNotes(
      plannerNotes.filter((note) => note.startDate <= iso && note.endDate >= iso)
    );
  }

  function scrollPlannerBoardToMatch() {
    if (!elements.plannerNotesList) {
      return;
    }

    const firstMatch = elements.plannerNotesList.querySelector(".planner-note.is-calendar-match");
    const boardPanel = elements.plannerNotesList.closest(".planner-board-panel");
    if (!firstMatch || !boardPanel) {
      return;
    }

    boardPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      firstMatch.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function updatePlannerStatus(text) {
    if (elements.plannerStatus) {
      elements.plannerStatus.textContent = text;
    }
  }

  function render() {
    renderStats();
    renderWeekBars();
    renderMonthCalendar();
    renderList();
    renderPlannerNotes();
    renderPlannerCalendar();
    normalizeUiPolish();
  }

  function renderStats() {
    const todayIso = toIsoDate(new Date());
    const metrics = getWorkMetrics(todayIso);

    elements.totalHours.textContent = `${metrics.totalHours.toFixed(2)} h`;
    elements.todayHours.textContent = `${metrics.todayHours.toFixed(2)} h`;
    elements.monthTotal.textContent = `${metrics.monthHours.toFixed(2)} h`;
    elements.monthHours.textContent = `${metrics.monthHours.toFixed(2)} h`;
    elements.streakDays.textContent = `${metrics.streakDays} dni`;
    elements.entryCount.textContent = String(entries.length);
    elements.avgHours.textContent = `${metrics.avgHours.toFixed(2)} h`;
    if (elements.progressEntries) {
      elements.progressEntries.textContent = String(entries.length);
    }
    if (elements.progressMonthTotal) {
      elements.progressMonthTotal.textContent = `${metrics.monthHours.toFixed(2)} h`;
    }
    if (elements.progressAvgHours) {
      elements.progressAvgHours.textContent = `${metrics.avgHours.toFixed(2)} h`;
    }
    renderEarnings(earningsViewDate);

    inactivityPenaltyState = getInactivityPenalty(todayIso);
    const baseExp = calculateExpFromMinutes(metrics.totalMinutes);

    for (let i = 0; i < 4; i += 1) {
      const totalExpCandidate = Math.max(
        0,
        baseExp + profileState.bonusExp - inactivityPenaltyState.expPenalty
      );
      const levelCandidate = getLevelFromExp(totalExpCandidate);
      const newlyUnlocked = unlockAchievements({
        level: levelCandidate.level,
        streakDays: metrics.qualifiedStreakDays,
        totalHours: metrics.totalHours,
        monthHours: metrics.monthHours
      });
      if (newlyUnlocked === 0) {
        break;
      }
    }

    const totalExp = Math.max(0, baseExp + profileState.bonusExp - inactivityPenaltyState.expPenalty);
    const levelData = renderLevel(totalExp);
    const rankData = renderRank(levelData.level);
    renderAchievements(levelData.level, metrics);
    scheduleLeaderboardSync({
      nickname: getCurrentUserName(),
      level: levelData.level,
      rank: rankData.current.name,
      rankLevel: `${rankData.current.name} ${rankData.subRankLabel}`,
      totalExp,
      totalHours: metrics.totalHours
    });
    void renderLeaderboard();
  }

  function renderLiveProgress() {
    if (!timerState.running) {
      return;
    }

    const storedMinutes = entries.reduce((sum, entry) => sum + getEntryDurationMinutes(entry), 0);
    const liveMinutes = getTimerActiveMs() / 60000;
    const todayIso = toIsoDate(new Date());
    inactivityPenaltyState = getInactivityPenalty(todayIso);
    const baseExp = calculateExpFromMinutes(storedMinutes + liveMinutes);
    const totalExp = Math.max(
      0,
      baseExp + profileState.bonusExp - inactivityPenaltyState.expPenalty
    );
    const liveMetrics = getWorkMetrics(todayIso);
    const levelData = renderLevel(totalExp);
    renderRank(levelData.level);
    renderAchievements(levelData.level, liveMetrics);
  }

  function calculateExpFromMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
    const fullHours = Math.floor(safeMinutes / 60);
    const minuteExp = safeMinutes * EXP_PER_MINUTE;
    const hourBonusExp = fullHours * EXP_PER_FULL_HOUR_BONUS;
    return minuteExp + hourBonusExp;
  }

  function getWorkMetrics(todayIso) {
    const todayDate = parseEntryDate(todayIso) || new Date();
    const currentYear = todayDate.getFullYear();
    const currentMonth = todayDate.getMonth();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const uniqueDays = new Set();
    let totalMinutes = 0;
    let todayMinutes = 0;
    let monthMinutes = 0;
    let yearMinutes = 0;
    let yearMinutesBeforeMonth = 0;

    entries.forEach((entry) => {
      const durationMinutes = getEntryDurationMinutes(entry);
      totalMinutes += durationMinutes;

      const entryDate = parseEntryDate(entry.date);
      if (!entryDate) {
        uniqueDays.add(String(entry.id || entry.date || "unknown"));
        return;
      }

      const entryIso = toIsoDate(entryDate);
      uniqueDays.add(entryIso);

      if (entryIso === todayIso) {
        todayMinutes += durationMinutes;
      }
      if (entryDate.getFullYear() === currentYear) {
        yearMinutes += durationMinutes;
        if (entryDate.getMonth() === currentMonth) {
          monthMinutes += durationMinutes;
        } else if (entryDate < firstDayOfMonth) {
          yearMinutesBeforeMonth += durationMinutes;
        }
      }
    });

    const totalHours = totalMinutes / 60;
    const todayHours = todayMinutes / 60;
    const monthHours = monthMinutes / 60;
    const yearHours = yearMinutes / 60;
    const activeDays = uniqueDays.size || 1;
    const avgHours = totalHours / activeDays;
    const streakDays = calculateStreak();
    const qualifiedStreakDays = calculateQualifiedStreak(MIN_ACHIEVEMENT_DAY_MINUTES);

    return {
      totalMinutes,
      totalHours,
      todayHours,
      monthHours,
      yearHours,
      monthMinutes,
      yearMinutes,
      yearMinutesBeforeMonth,
      avgHours,
      streakDays,
      qualifiedStreakDays
    };
  }

  function getEarningsMetrics(forDate) {
    const year = forDate.getFullYear();
    const month = forDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);

    let monthMinutes = 0;
    let yearMinutes = 0;
    let yearMinutesBeforeMonth = 0;

    entries.forEach((entry) => {
      const durationMinutes = getEntryDurationMinutes(entry);
      const entryDate = parseEntryDate(entry.date);
      if (!entryDate) {
        return;
      }

      if (entryDate.getFullYear() === year) {
        yearMinutes += durationMinutes;
        if (entryDate.getMonth() === month) {
          monthMinutes += durationMinutes;
        } else if (entryDate < firstDayOfMonth) {
          yearMinutesBeforeMonth += durationMinutes;
        }
      }
    });

    const yearToDateMinutes = monthMinutes + yearMinutesBeforeMonth;

    return {
      monthHours: monthMinutes / 60,
      yearHours: yearMinutes / 60,
      yearToDateHours: yearToDateMinutes / 60,
      yearMinutesBeforeMonth: yearMinutesBeforeMonth
    };
  }

  function renderEarnings(forDate) {
    if (
      !elements.earningsMonthGross || !elements.earningsMonthNet || !elements.earningsYearGross || !elements.earningsYearNet
    ) {
      return;
    }

    const metrics = getEarningsMetrics(forDate);
    const today = new Date();
    const isCurrentMonth = forDate.getFullYear() === today.getFullYear() && forDate.getMonth() === today.getMonth();

    if (elements.earningsMonthLabel) {
      const label = forDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
      elements.earningsMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }

    if (elements.earningsNextBtn) {
      elements.earningsNextBtn.disabled = isCurrentMonth;
    }

    const hourlyRate = profileState.hourlyRate > 0 ? profileState.hourlyRate : MINIMUM_HOURLY_RATE;
    const currentYear = String(forDate.getFullYear());
    const monthGross = roundMoney(metrics.monthHours * hourlyRate);
    const yearToDateGross = roundMoney(metrics.yearToDateHours * hourlyRate);
    const yearGrossBeforeMonth = roundMoney((metrics.yearMinutesBeforeMonth / 60) * hourlyRate);
    const monthEstimate = estimateAfterPit(monthGross, yearGrossBeforeMonth);
    const yearToDateEstimate = estimateAfterPit(yearToDateGross, 0);

    if (elements.earningsRateBadge) {
      elements.earningsRateBadge.textContent = `Stawka: ${formatCurrency(hourlyRate)} / h`;
    }
    if (elements.earningsModeLabel) {
      elements.earningsModeLabel.textContent = profileState.taxReliefUnder26
        ? "Tryb: ulga <26 aktywna"
        : "Tryb: standardowy PIT 12%";
    }

    elements.earningsMonthGross.textContent = formatCurrency(monthGross);
    elements.earningsMonthNet.textContent = formatCurrency(monthEstimate.afterPit);
    elements.earningsYearGross.textContent = formatCurrency(yearToDateGross);
    elements.earningsYearNet.textContent = formatCurrency(yearToDateEstimate.afterPit);

    if (elements.earningsHint) {
      const totalYearGross = roundMoney(metrics.yearHours * hourlyRate);
      if (profileState.taxReliefUnder26 && totalYearGross > YOUTH_PIT_RELIEF_LIMIT) {
        elements.earningsHint.textContent = `Ulga <26 dla ${currentYear} została przekroczona po limicie ${formatCurrency(YOUTH_PIT_RELIEF_LIMIT)}. Nadwyżka liczona jest z uproszczonym PIT 12%.`;
      } else if (profileState.taxReliefUnder26) {
        const remainingRelief = Math.max(0, YOUTH_PIT_RELIEF_LIMIT - totalYearGross);
        elements.earningsHint.textContent = `Ulga <26 aktywna. W ${currentYear} zostało jeszcze około ${formatCurrency(remainingRelief)} limitu zwolnienia z PIT. Szacunek nie uwzględnia ZUS.`;
      } else {
        elements.earningsHint.textContent = "Szacunek po PIT odejmuje tylko uproszczone 12% podatku. Nie uwzględnia ZUS, kosztów uzyskania przychodu ani indywidualnych ulg.";
      }
    }
  }

  function estimateAfterPit(grossAmount, reliefUsedBeforeAmount = 0) {
    const safeGross = roundMoney(grossAmount);
    const reliefUsedBefore = Math.max(0, Number(reliefUsedBeforeAmount) || 0);
    let taxableAmount = safeGross;

    if (profileState.taxReliefUnder26) {
      const remainingRelief = Math.max(0, YOUTH_PIT_RELIEF_LIMIT - reliefUsedBefore);
      const reliefApplied = Math.min(safeGross, remainingRelief);
      taxableAmount = safeGross - reliefApplied;
    }

    const estimatedPit = roundMoney(taxableAmount * STANDARD_PIT_RATE);
    return {
      gross: safeGross,
      estimatedPit,
      afterPit: roundMoney(safeGross - estimatedPit)
    };
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function roundMoney(value) {
    return Number((Math.max(0, Number(value) || 0)).toFixed(2));
  }

  function unlockAchievements(context) {
    const unlocked = new Set(profileState.unlockedAchievementIds);
    const newlyUnlocked = [];

    for (const achievement of ACHIEVEMENTS) {
      if (unlocked.has(achievement.id)) {
        continue;
      }
      if (isAchievementUnlocked(achievement, context)) {
        newlyUnlocked.push(achievement);
      }
    }

    if (newlyUnlocked.length === 0) {
      return 0;
    }

    let gainedExp = 0;
    for (const achievement of newlyUnlocked) {
      unlocked.add(achievement.id);
      gainedExp += achievement.rewardExp;
    }
    profileState.unlockedAchievementIds = [...unlocked];
    profileState.bonusExp += gainedExp;
    persistProfileState();

    return newlyUnlocked.length;
  }

  function isAchievementUnlocked(achievement, context) {
    const req = achievement.requirement || {};
    if (req.type === "level") {
      return context.level >= req.value;
    }
    if (req.type === "streak") {
      return context.streakDays >= req.value;
    }
    if (req.type === "totalHours") {
      return context.totalHours >= req.value;
    }
    if (req.type === "monthHours") {
      return context.monthHours >= req.value;
    }
    if (req.type === "rankMinLevel") {
      return context.level >= req.value;
    }
    if (req.type === "combo") {
      return context.level >= (req.level || 0) && context.streakDays >= (req.streak || 0);
    }
    return false;
  }

  function formatAchievementRequirement(req) {
    if (!req) {
      return "warunek specjalny";
    }
    if (req.type === "level") {
      return `lvl ${req.value}`;
    }
    if (req.type === "streak") {
      return `seria ${req.value} dni`;
    }
    if (req.type === "totalHours") {
      return `${req.value}h lacznie`;
    }
    if (req.type === "monthHours") {
      return `${req.value}h w miesi?cu`;
    }
    if (req.type === "rankMinLevel") {
      return `ranga od lvl ${req.value}`;
    }
    if (req.type === "combo") {
      return `lvl ${req.level} i seria ${req.streak} dni`;
    }
    return "warunek specjalny";
  }

  function getAchievementProgressLabel(req, level, metrics) {
    if (!req) {
      return "W toku";
    }
    if (req.type === "level") {
      return `Lvl ${Math.min(level, req.value)}/${req.value}`;
    }
    if (req.type === "streak") {
      return `Seria ${Math.min(metrics.qualifiedStreakDays || 0, req.value)}/${req.value}`;
    }
    if (req.type === "totalHours") {
      return `${Math.min(metrics.totalHours, req.value).toFixed(1)} / ${req.value}h`;
    }
    if (req.type === "monthHours") {
      return `${Math.min(metrics.monthHours, req.value).toFixed(1)} / ${req.value}h`;
    }
    if (req.type === "rankMinLevel") {
      return `Lvl ${Math.min(level, req.value)}/${req.value}`;
    }
    if (req.type === "combo") {
      return `Lvl ${Math.min(level, req.level)}/${req.level} | Seria ${Math.min(metrics.qualifiedStreakDays || 0, req.streak)}/${req.streak}`;
    }
    return "W toku";
  }

  function getInactivityPenalty(todayIso) {
    if (entries.length === 0 && !timerState.running) {
      return { inactiveDays: 0, decayDays: 0, expPenalty: 0 };
    }

    const lastActivityIso = getLastActivityIso(todayIso);
    if (!lastActivityIso) {
      return { inactiveDays: 0, decayDays: 0, expPenalty: 0 };
    }

    const allInactiveDays = Math.max(0, daysBetweenIso(lastActivityIso, todayIso));
    let protectedDaysCount = 0;
    for (let i = 1; i <= allInactiveDays; i += 1) {
      const dayIso = addDaysToIso(lastActivityIso, i);
      if (isProtectedOffDay(dayIso)) {
        protectedDaysCount += 1;
      }
    }
    const inactiveDays = Math.max(0, allInactiveDays - protectedDaysCount);
    const decayDays = Math.max(0, inactiveDays - DECAY_GRACE_DAYS);
    const expPenalty = decayDays * DECAY_EXP_PER_DAY;

    return { inactiveDays, decayDays, expPenalty, protectedDays: protectedDaysCount };
  }

  function getLastActivityIso(todayIso) {
    if (timerState.running) {
      return todayIso;
    }
    if (entries.length === 0) {
      return "";
    }
    return entries.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), entries[0].date);
  }

  function daysBetweenIso(fromIso, toIso) {
    const from = isoToDate(fromIso);
    const to = isoToDate(toIso);
    const diff = to.getTime() - from.getTime();
    return Math.floor(diff / 86400000);
  }

  function isoToDate(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDaysToIso(iso, days) {
    const dt = isoToDate(iso);
    dt.setDate(dt.getDate() + days);
    return toIsoDate(dt);
  }

  function isIsoDateLike(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function isProtectedOffDay(iso) {
    if (!isIsoDateLike(iso)) {
      return false;
    }
    if (profileState.vacationDays.includes(iso)) {
      return true;
    }
    if (profileState.offDays.includes(iso)) {
      return true;
    }
    if (profileState.sickDays.includes(iso)) {
      return true;
    }
    if (profileState.absentDays.includes(iso)) {
      return true;
    }
    if (isWeekendIso(iso)) {
      return true;
    }
    if (isPolishHoliday(iso)) {
      return true;
    }
    return false;
  }

  function isWeekendIso(iso) {
    const day = isoToDate(iso).getDay();
    return day === 0 || day === 6;
  }

  function getPolishHolidayName(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const fixed = {
      "01-01": "Nowy Rok",
      "01-06": "Trzech Króli",
      "05-01": "Święto Pracy",
      "05-03": "Święto Konstytucji 3 Maja",
      "08-15": "Wniebowzięcie NMP",
      "11-01": "Wszystkich Świętych",
      "11-11": "Święto Niepodległości",
      "12-25": "Boże Narodzenie",
      "12-26": "Drugi dzień świąt"
    };
    if (fixed[md]) return fixed[md];

    const easter = getEasterDate(year);
    const easterIso = toIsoDate(easter);
    const easterMondayIso = toIsoDate(new Date(year, easter.getMonth(), easter.getDate() + 1));
    const corpusChristiIso = toIsoDate(new Date(year, easter.getMonth(), easter.getDate() + 60));
    const pentecostIso = toIsoDate(new Date(year, easter.getMonth(), easter.getDate() + 49));

    if (iso === easterIso) return "Wielkanoc";
    if (iso === easterMondayIso) return "Poniedziałek Wielkanocny";
    if (iso === corpusChristiIso) return "Boże Ciało";
    if (iso === pentecostIso) return "Zielone Świątki";

    return null;
  }

  function isPolishHoliday(iso) {
    return Boolean(getPolishHolidayName(iso));
  }

  function getEasterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function renderWeekBars() {
    const weekData = getCurrentWeekData();
    const max = Math.max(...weekData.days.map((day) => day.hours), 1);

    elements.weekBars.innerHTML = weekData.days
      .map((day) => {
        const height = Math.max((day.hours / max) * 100, day.hours > 0 ? 14 : 6);
        return `
          <div class="week-bar">
            <div class="week-bar__track">
              <div class="week-bar__fill" style="height:${height}%"></div>
            </div>
            <div class="week-bar__meta">
              <strong>${day.hours.toFixed(1)}h</strong>
              <span>${day.label}</span>
            </div>
          </div>
        `;
        })
        .join("");
  }

  function renderMonthCalendar() {
    if (!elements.monthCalendar) {
      return;
    }

    const viewYear = calendarViewDate.getFullYear();
    const viewMonth = calendarViewDate.getMonth();
    const firstDay = new Date(viewYear, viewMonth, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - firstWeekday);
    const todayIso = toIsoDate(new Date());

    if (elements.calendarMonthLabel) {
      elements.calendarMonthLabel.textContent = calendarViewDate.toLocaleDateString("pl-PL", {
        month: "long",
        year: "numeric"
      });
    }

    const headers = ["Pon", "Wt", "Sr", "Czw", "Pt", "Sob", "Niedz"]
      .map((label) => `<div class="month-calendar__head">${label}</div>`)
      .join("");
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const currentDate = new Date(gridStart);
      currentDate.setDate(gridStart.getDate() + i);
      const iso = toIsoDate(currentDate);
      const workedMinutes = getWorkedMinutesForDate(iso);
      const isWorked = workedMinutes > 0;
      const holidayName = getPolishHolidayName(iso);
      const isVacation = profileState.vacationDays.includes(iso);
      const isManualOffDay = profileState.offDays.includes(iso);
      const isSickDay = profileState.sickDays.includes(iso);
      const isAbsent = profileState.absentDays.includes(iso);
      const isHoliday = isPolishHoliday(iso) || isWeekendIso(iso);
      const isFuture = iso > todayIso;
      const isOutsideMonth = currentDate.getMonth() !== viewMonth;

      let statusClass = "month-calendar__cell--neutral";
      let statusSlug = "";
      if (isWorked) {
        statusClass = "month-calendar__cell--work";
        statusSlug = "work";
      } else if (isVacation) {
        statusClass = "month-calendar__cell--vacation";
        statusSlug = "vacation";
      } else if (isSickDay) {
        statusClass = "month-calendar__cell--l4";
        statusSlug = "l4";
      } else if (isAbsent) {
        statusClass = "month-calendar__cell--absent-planned";
        statusSlug = "absent";
      } else if (isManualOffDay || isHoliday) {
        statusClass = "month-calendar__cell--off";
        statusSlug = "off";
      } else if (!isFuture) {
        statusClass = "month-calendar__cell--absent";
        statusSlug = "absent-unexcused";
      }

      const title = isWorked
        ? `${formatDate(iso)} | Praca: ${(workedMinutes / 60).toFixed(2)} h`
        : isVacation
          ? `${formatDate(iso)} | Urlop`
          : isSickDay
            ? `${formatDate(iso)} | L4`
          : isAbsent // If the current user is absent
            ? `${formatDate(iso)} | ${getCurrentUserName()} | Nieobecność` // Explicitly state current user's name
          : isManualOffDay
            ? `${formatDate(iso)} | Dzień wolny`
            : holidayName
            ? `${formatDate(iso)} | ${holidayName}`
            : isHoliday
            ? `${formatDate(iso)} | Weekend`
            : isFuture
              ? `${formatDate(iso)} | Dzień przyszły`
              : `${formatDate(iso)} | Brak wpisu`;

      const todayClass = iso === todayIso ? " month-calendar__cell--today" : "";
      const outsideClass = isOutsideMonth ? " month-calendar__cell--outside" : "";
      const isDisabled = isOutsideMonth;

      cells.push(`
        <button 
          type="button" 
          class="month-calendar__cell ${statusClass}${todayClass}${outsideClass}" 
          data-title="${escapeHtml(title)}"
          data-status-slug="${statusSlug}"
          ${isDisabled ? 'disabled' : ''}
        >${currentDate.getDate()}</button>`);
    }

    elements.monthCalendar.innerHTML = `${headers}${cells.join("")}`;
  }

  function handleCalendarDayClick(event) {
    const cell = event.target.closest(".month-calendar__cell");
    if (!cell || !cell.dataset.title) {
      return;
    }

    const info = cell.dataset.title;
    const statusSlug = cell.dataset.statusSlug || "";
    const [datePart, ...rest] = info.split(" | ");

    if (elements.dayInfoModalTitle) {
      elements.dayInfoModalTitle.textContent = datePart || "Szczegóły dnia";
    }
    if (elements.dayInfoModalContent) {
      elements.dayInfoModalContent.innerHTML = "";
      if (rest.length === 0) {
        elements.dayInfoModalContent.innerHTML = `<div class="md3-body-medium text-secondary">Brak dodatkowych informacji.</div>`;
      } else {
        rest.forEach(item => {
          const div = document.createElement('div');
          // Prosta detekcja: jeśli tekst zawiera słowa kluczowe statusu lub kończy się na "h" (godziny), traktuj jako status
          const isStatus = /Praca|Urlop|L4|Nieobecność|Wolne|Weekend|Święto|h|Brak wpisu$/.test(item);
          if (isStatus) {
            div.className = 'day-info-status';
            if (statusSlug) {
              div.classList.add(`day-info-status--${statusSlug}`);
            }
          } else {
            div.className = 'day-info-row';
          }
          div.textContent = item;
          elements.dayInfoModalContent.appendChild(div);
        });
      }
    }
    if (elements.dayInfoModal) {
      elements.dayInfoModal.hidden = false;
    }
  }

  function getWorkedMinutesForDate(iso) {
    return entries
      .filter((entry) => entry.date === iso)
      .reduce((sum, entry) => sum + getEntryDurationMinutes(entry), 0);
  }

  function renderList() {
    if (entries.length === 0) {
      elements.list.innerHTML = `<li class="entries-v3-empty">Brak wpisow. Dodaj pierwszy czas pracy.</li>`;
      return;
    }

    // Sortujemy widoczne wpisy po dacie malejąco, aby grupowanie działało poprawnie
    const visibleEntries = entries
      .slice(0, MAX_RENDERED_ENTRIES)
      .sort((a, b) => b.date.localeCompare(a.date));

    let currentMonthLabel = "";

    elements.list.innerHTML = visibleEntries
      .map((entry) => {
        let headerHtml = "";
        const dateObj = parseEntryDate(entry.date);
        if (dateObj) {
          const label = dateObj.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
          if (label !== currentMonthLabel) {
            currentMonthLabel = label;
            const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
            headerHtml = `<h4 class="entries-month-header">${capitalized}</h4>`;
          }
        }

        return `
            ${headerHtml}
            <li class="entries-v3-item" data-entry-id="${entry.id}">
              <div class="entries-v3-main">
                <div class="entries-v3-top">
                  <span class="entries-v3-date">${formatDate(entry.date)}</span>
                  <span class="entries-v3-day">${getWeekdayLabel(entry.date)}</span>
                </div>
                <div class="entries-v3-time">${entry.start} - ${entry.end}</div>
              </div>
              <div class="entries-v3-side">
                <span class="entries-v3-hours">${(getEntryDurationMinutes(entry) / 60).toFixed(2)} h</span>
                <button type="button" class="entries-v3-remove" data-id="${entry.id}">Usuń</button>
              </div>
            </li>
          `;
      })
      .join("");

    if (entries.length > MAX_RENDERED_ENTRIES) {
      elements.list.insertAdjacentHTML(
        "beforeend",
        `<li class="entries-v3-empty">Wyswietlam ${MAX_RENDERED_ENTRIES} najnowszych wpisow dla plynnego dzialania.</li>`
      );
    }
  }

  function formatDate(value) {
    const date = parseEntryDate(value);
    if (!date) {
      return String(value || "-");
    }
    return date.toLocaleDateString("pl-PL");
  }

  function getWeekdayLabel(value) {
    const date = parseEntryDate(value);
    if (!date) {
      return "-";
    }
    const dayName = date.toLocaleDateString("pl-PL", { weekday: "long" });
    return dayName.charAt(0).toUpperCase() + dayName.slice(1);
  }

  function parseEntryDate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-").map(Number);
      const dt = new Date(year, month - 1, day);
      return Number.isFinite(dt.getTime()) ? dt : null;
    }

    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split(".").map(Number);
      const dt = new Date(year, month - 1, day);
      return Number.isFinite(dt.getTime()) ? dt : null;
    }

    const dt = new Date(raw);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function formatDurationLabel(minutes) {
    const safe = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${hours}h ${String(mins).padStart(2, "0")}m`;
  }

  function getEntrySourceLabel(entry) {
    const source = String(entry.source || "manual").toLowerCase();
    if (source === "timer") {
      return "Timer";
    }
    if (source === "quick") {
      return "Szybki";
    }
    if (source === "clone") {
      return "Kopia";
    }
    return "R?czny";
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getEntryDurationMinutes(entry) {
    if (Number.isFinite(entry.durationMinutes)) {
      return Math.max(0, Math.round(entry.durationMinutes));
    }
    return getDurationMinutes(entry.start, entry.end);
  }

  function playLevelUpSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.1, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // C Major Arpeggio
      playTone(523.25, now, 0.1);       // C5
      playTone(659.25, now + 0.1, 0.1); // E5
      playTone(783.99, now + 0.2, 0.1); // G5
      playTone(1046.50, now + 0.3, 0.4);// C6
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playLoginSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      playTone(440, now, 0.1);
      playTone(880, now + 0.1, 0.15);
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playLogoutSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      playTone(880, now, 0.1);
      playTone(440, now + 0.1, 0.15);
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playTabSwitchSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  function renderLevel(totalExp) {
    const safeExp = Math.max(0, Number(totalExp) || 0);
    const levelData = getLevelFromExp(safeExp);
    
    if (lastKnownLevel !== null && levelData.level > lastKnownLevel) {
      playLevelUpSound();
    }
    lastKnownLevel = levelData.level;

    const progress = levelData.isMax ? 100 : (levelData.currentExp / levelData.nextLevelExp) * 100;
    const displayTotalExp = Math.floor(safeExp);
    const displayCurrentExp = Math.floor(levelData.currentExp);

    if (elements.userProfileLevel) {
      elements.userProfileLevel.textContent = String(levelData.level);
    }
    if (elements.progressProfileLevel) {
      elements.progressProfileLevel.textContent = String(levelData.level);
    }
    if (elements.userExp) {
      elements.userExp.textContent = `${displayTotalExp} EXP`;
    }
    if (elements.progressExp) {
      elements.progressExp.textContent = `${displayTotalExp} EXP`;
    }
    if (elements.levelMeta) {
      const decayMeta = inactivityPenaltyState.expPenalty > 0
        ? ` | Kara bezczynno?ci: -${inactivityPenaltyState.expPenalty} EXP (${inactivityPenaltyState.inactiveDays} dni)`
        : "";
      elements.levelMeta.textContent = levelData.isMax
        ? `MAX poziom (${MAX_PROFILE_LEVEL})`
        : `${displayCurrentExp} / ${levelData.nextLevelExp} EXP do nast?pnego poziomu${decayMeta}`;
    }
    if (elements.levelProgressBar) {
      animateProgressBar(elements.levelProgressBar, progress);
    }
    if (elements.navUserLevel) {
      elements.navUserLevel.textContent = `Poziom ${levelData.level}`;
    }
    if (elements.progressNavUserLevel) {
      elements.progressNavUserLevel.textContent = `Poziom ${levelData.level}`;
    }
    if (elements.navLevelProgressBar) {
      animateProgressBar(elements.navLevelProgressBar, progress);
    }
    if (elements.progressNavLevelProgressBar) {
      animateProgressBar(elements.progressNavLevelProgressBar, progress);
    }
    if (elements.navProgressMeta) {
      const navDecayMeta = inactivityPenaltyState.expPenalty > 0
        ? ` | -${inactivityPenaltyState.expPenalty} EXP za bezczynno??`
        : "";
      elements.navProgressMeta.textContent = levelData.isMax
        ? `MAX poziom (${MAX_PROFILE_LEVEL})`
        : `${displayCurrentExp} / ${levelData.nextLevelExp} EXP do nast?pnego poziomu${navDecayMeta}`;
    }
    if (elements.progressNavProgressMeta) {
      const progressNavDecayMeta = inactivityPenaltyState.expPenalty > 0
        ? ` | -${inactivityPenaltyState.expPenalty} EXP za bezczynno??`
        : "";
      elements.progressNavProgressMeta.textContent = levelData.isMax
        ? `MAX poziom (${MAX_PROFILE_LEVEL})`
        : `${displayCurrentExp} / ${levelData.nextLevelExp} EXP do nast?pnego poziomu${progressNavDecayMeta}`;
    }
    return levelData;
  }

  function renderAchievements(currentLevel, metrics) {
    const unlockedSet = new Set(profileState.unlockedAchievementIds);
    const next = ACHIEVEMENTS.find((achievement) => !unlockedSet.has(achievement.id));
    elements.nextAchievement.textContent = next
      ? `Nast?pne osi?gni?cie: ${next.title} (${formatAchievementRequirement(next.requirement)})`
      : "Nast?pne osi?gni?cie: wszystkie odblokowane";

    if (elements.rewardBank) {
      elements.rewardBank.textContent = `Bank nagrod: +${Math.floor(profileState.bonusExp)} EXP`;
    }

    elements.achievementsList.innerHTML = ACHIEVEMENTS.map((achievement) => {
      const unlocked = unlockedSet.has(achievement.id);
      const progressLabel = unlocked
        ? `Odblokowane | +${achievement.rewardExp} EXP`
        : getAchievementProgressLabel(achievement.requirement, currentLevel, metrics);
      return `
        <li class="achievement-item rarity-${achievement.rarity} ${unlocked ? "is-unlocked" : ""}">
          <div class="achievement-item__content">
            <strong>${achievement.title}</strong>
            <p>${achievement.description}</p>
          </div>
          <div class="achievement-item__meta">
            <em>${achievement.rarityLabel}</em>
            <span>${progressLabel}</span>
          </div>
        </li>
      `;
    }).join("");
  }

  function renderRank(level) {
    const rankData = getRankData(level);
    const rankSlug = getRankSlug(rankData.current.name);
    const theme = RANK_THEMES[rankSlug] || RANK_THEMES.bronze;
    const rankDisplay = `${rankData.current.name} ${rankData.subRankLabel}`;

    elements.userRank.textContent = rankData.current.name;
    elements.userRankLevel.textContent = rankDisplay;
    if (elements.progressRankLevel) {
      elements.progressRankLevel.textContent = rankDisplay;
    }
    if (elements.navUserRank) {
      elements.navUserRank.textContent = rankDisplay;
    }
    if (elements.progressNavUserRank) {
      elements.progressNavUserRank.textContent = rankDisplay;
    }
    elements.nextRank.textContent = rankData.next
      ? `Nast?pna: ${rankData.next.name} | lvl ${rankData.next.minLevel}`
      : `Cel: poziom ${MAX_PROFILE_LEVEL}`;
    elements.rankMeta.textContent = rankData.isMaxLevel
      ? `Poziom rangi: ${rankData.currentRankLevel}/${rankData.maxRankLevel} | Segment ${rankData.subRankLabel} | MAX`
      : `Poziom rangi: ${rankData.currentRankLevel}/${rankData.maxRankLevel} | Segment ${rankData.subRankLabel} | ${rankData.progress}%`;
    animateProgressBar(elements.rankProgressBar, rankData.progress);

    elements.rankBox.style.setProperty("--rank-accent", theme.accent);
    elements.rankBox.style.setProperty("--rank-accent-soft", theme.accentSoft);
    elements.rankBox.style.setProperty("--rank-rgb", theme.rgb);
    elements.rankBox.dataset.rank = rankSlug;
    elements.rankBox.classList.toggle("rank-is-rare", theme.rare);

    if (elements.mainProfileAvatar) {
      elements.mainProfileAvatar.style.setProperty("--rank-rgb", theme.rgb);
      elements.mainProfileAvatar.classList.toggle("rank-is-rare", theme.rare);
    }

    elements.rankSteps.innerHTML = RANKS.map((rank) => {
      let cls = "is-upcoming";
      if (rank.minLevel < rankData.current.minLevel) {
        cls = "is-complete";
      } else if (rank.minLevel === rankData.current.minLevel) {
        cls = "is-current";
      }
      return `<li class="rank-minimal-step ${cls}" title="${rank.name} (lvl ${rank.minLevel})">${rank.name}</li>`;
      }).join("");
    return rankData;
  }

  function animateProgressBar(element, targetPercent) {
    if (!element) {
      return;
    }

    const target = clampPercent(targetPercent);
    if (prefersReducedMotion || document.body.classList.contains("low-performance")) {
      element.style.width = `${target}%`;
      element.dataset.progressValue = String(target);
      return;
    }

    const runningAnimation = progressAnimations.get(element);
    if (runningAnimation) {
      cancelAnimationFrame(runningAnimation);
    }

    const startValue = clampPercent(Number(element.dataset.progressValue || 0));
    const delta = target - startValue;
    const startTime = performance.now();

    const frame = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / PROGRESS_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextValue = startValue + delta * eased;
      element.style.width = `${nextValue}%`;

      if (t < 1) {
        const frameId = requestAnimationFrame(frame);
        progressAnimations.set(element, frameId);
        return;
      }

      element.dataset.progressValue = String(target);
      progressAnimations.delete(element);
    };

    const frameId = requestAnimationFrame(frame);
    progressAnimations.set(element, frameId);
  }

  function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(100, numeric));
  }

  function getRankSlug(name) {
    return String(name || "")
      .trim()
      .toLowerCase();
  }

  function getRankData(level) {
    const safeLevel = Math.max(1, Math.min(MAX_PROFILE_LEVEL, Math.floor(level)));
    let current = RANKS[0];
    let next = null;

    for (let i = 0; i < RANKS.length; i += 1) {
      if (safeLevel >= RANKS[i].minLevel) {
        current = RANKS[i];
        next = RANKS[i + 1] || null;
      }
    }

    const currentRankLevel = Math.max(1, safeLevel - current.minLevel + 1);
    const maxRankLevel = next
      ? next.minLevel - current.minLevel
      : MAX_PROFILE_LEVEL - current.minLevel + 1;
    const tierSize = Math.max(1, Math.ceil(maxRankLevel / SUB_RANK_LABELS.length));
    const subRankIndex = Math.min(SUB_RANK_LABELS.length - 1, Math.floor((currentRankLevel - 1) / tierSize));
    const subRankLabel = SUB_RANK_LABELS[subRankIndex];

    if (!next) {
      const endSpan = Math.max(1, maxRankLevel - 1);
      const done = Math.max(0, currentRankLevel - 1);
      const progress = Math.max(0, Math.min(100, Math.round((done / endSpan) * 100)));
      return {
        current,
        next,
        progress,
        currentRankLevel,
        maxRankLevel,
        subRankLabel,
        isMaxLevel: safeLevel >= MAX_PROFILE_LEVEL
      };
    }

    const levelSpan = maxRankLevel;
    const done = Math.max(0, safeLevel - current.minLevel);
    const progress = Math.max(0, Math.min(100, Math.round((done / levelSpan) * 100)));
    return {
      current,
      next,
      progress,
      currentRankLevel,
      maxRankLevel: levelSpan,
      subRankLabel,
      isMaxLevel: false
    };
  }

  function getLevelFromExp(exp) {
    let level = 1;
    let remaining = exp;
    let nextLevelExp = getRequiredExp(level);

    while (level < MAX_PROFILE_LEVEL && remaining >= nextLevelExp) {
      remaining -= nextLevelExp;
      level += 1;
      nextLevelExp = getRequiredExp(level);
    }

    if (level >= MAX_PROFILE_LEVEL) {
      return {
        level: MAX_PROFILE_LEVEL,
        currentExp: 1,
        nextLevelExp: 1,
        isMax: true
      };
    }

    return {
      level,
      currentExp: remaining,
      nextLevelExp,
      isMax: false
    };
  }

  function getRequiredExp(level) {
    return LEVEL_BASE_EXP + (level - 1) * LEVEL_STEP_EXP;
  }

  function getCurrentWeekData() {
    const now = new Date();
    const start = startOfWeek(now);
    const result = [];
    const shortNames = ["Pon", "Wt", "Sr", "Czw", "Pt", "Sob", "Niedz"];
    let total = 0;

    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const iso = toIsoDate(day);
      const hours = entries
        .filter((entry) => entry.date === iso)
        .reduce((sum, entry) => sum + getEntryDurationMinutes(entry), 0) / 60;
      total += hours;
      result.push({ label: shortNames[i], hours });
    }

    return { days: result, total };
  }

  function startOfWeek(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() + mondayOffset);
    return copy;
  }

  function calculateStreak() {
    const uniqueDates = [...new Set(entries.map((entry) => entry.date))].sort((a, b) =>
      b.localeCompare(a)
    );
    if (uniqueDates.length === 0) {
      return 0;
    }

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let cursorIso = toIsoDate(cursor);

    if (uniqueDates[0] !== cursorIso) {
      cursor.setDate(cursor.getDate() - 1);
      cursorIso = toIsoDate(cursor);
    }

    for (const iso of uniqueDates) {
      if (iso === cursorIso) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        cursorIso = toIsoDate(cursor);
      } else if (iso < cursorIso) {
        break;
      }
    }

    return streak;
  }

  function calculateQualifiedStreak(minMinutesPerDay) {
    const minutesByDay = new Map();
    for (const entry of entries) {
      const current = minutesByDay.get(entry.date) || 0;
      minutesByDay.set(entry.date, current + getEntryDurationMinutes(entry));
    }
    const qualifiedDates = [...minutesByDay.entries()]
      .filter(([, minutes]) => minutes >= minMinutesPerDay)
      .map(([date]) => date)
      .sort((a, b) => b.localeCompare(a));

    if (qualifiedDates.length === 0) {
      return 0;
    }

    let streak = 0;
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let cursorIso = toIsoDate(cursor);

    if (qualifiedDates[0] !== cursorIso) {
      cursor.setDate(cursor.getDate() - 1);
      cursorIso = toIsoDate(cursor);
    }

    for (const iso of qualifiedDates) {
      if (iso === cursorIso) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        cursorIso = toIsoDate(cursor);
      } else if (iso < cursorIso) {
        break;
      }
    }

    return streak;
  }

  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatMinutesToTime(totalMinutes) {
    const normalized = Math.max(0, Math.min(1439, totalMinutes));
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function toggleSidebar() {
    elements.sidebar.classList.toggle("is-open");
  }

  function switchView(view) {
    const activeView = ["main", "progress", "planner"].includes(view) ? view : "main";

    const currentActiveButton = document.querySelector(".nav-item.nav-item--active");
    const currentActiveView = currentActiveButton ? currentActiveButton.dataset.view : null;

    if (activeView !== currentActiveView) {
      playTabSwitchSound();
    }

    elements.viewMain.classList.toggle("is-active", activeView === "main");
    elements.viewProgress.classList.toggle("is-active", activeView === "progress");
    if (elements.viewPlanner) {
      elements.viewPlanner.classList.toggle("is-active", activeView === "planner");
    }
    elements.navViewButtons.forEach((button) => {
      button.classList.toggle("nav-item--active", button.dataset.view === activeView);
    });
    if (activeView === "planner") {
      void loadPlannerNotes(true);
    }
    if (window.innerWidth <= 860) {
      elements.sidebar.classList.remove("is-open");
    }
  }

  function applyRuntimeMode() {
    const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    prefersReducedMotion = Boolean(mediaQuery && mediaQuery.matches);

    const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    const lowPerformance = prefersReducedMotion || lowCpu || lowMemory;

    if (lowPerformance) {
      document.body.classList.add("low-performance");
    }

    if (mediaQuery) {
      const onChange = (event) => {
        prefersReducedMotion = Boolean(event.matches);
        document.body.classList.toggle("low-performance", prefersReducedMotion || lowCpu || lowMemory);
      };
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", onChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(onChange);
      }
    }
  }

  function handleOutsideSidebarClick(event) {
    if (window.innerWidth > 860 || !elements.sidebar.classList.contains("is-open")) {
      return;
    }
    const clickedInsideSidebar = elements.sidebar.contains(event.target);
    const clickedToggle = event.target === elements.toggleSidebar;
    if (!clickedInsideSidebar && !clickedToggle) {
      elements.sidebar.classList.remove("is-open");
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      elements.sidebar.classList.remove("is-open");
      closeAccountEditor();
    }
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function startEntranceAnimations() {
    if (document.body.classList.contains("low-performance") || prefersReducedMotion) {
      document.body.classList.add("app-ready");
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add("app-ready");
      });
    });
  }

  function setupIosMetaTags() {
    // Sprawdź czy to iOS
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (!isIos) return;

    const head = document.head;

    // 1. Viewport fit cover (dla notcha)
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && !viewport.content.includes('viewport-fit=cover')) {
      viewport.content += ', viewport-fit=cover';
    }

    // 2. Meta tagi PWA dla iOS
    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'Quest' }
    ];

    metaTags.forEach(tag => {
      if (!head.querySelector(`meta[name="${tag.name}"]`)) {
        const meta = document.createElement('meta');
        meta.name = tag.name;
        meta.content = tag.content;
        head.appendChild(meta);
      }
    });

    // 3. Ikona dotykowa Apple
    if (!head.querySelector('link[rel="apple-touch-icon"]')) {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = 'assets/apple-touch-icon.png';
      head.appendChild(link);
    }
  }

  function ensureIosModalExists() {
    if (document.getElementById("iosInstallModal")) return;

    const modalHtml = `
      <div class="md3-dialog">
        <div class="md3-headline-small">Instalacja na iOS</div>
        <div class="md3-body-medium text-secondary">Aplikacja Quest działa najlepiej jako aplikacja na ekranie głównym.</div>
        
        <div class="ios-instruction-step">
          <div class="ios-icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></div>
          <div class="md3-body-medium">1. Kliknij przycisk "Udostępnij" na pasku nawigacji Safari.</div>
        </div>

        <div class="ios-instruction-step">
          <div class="ios-icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg></div>
          <div class="md3-body-medium">2. Wybierz "Do ekranu początkowego" z listy opcji.</div>
        </div>

        <div class="flex-row justify-end"><button type="button" id="iosInstallCloseBtn" class="md3-btn md3-btn-text">Zamknij</button></div>
      </div>`;

    const modal = document.createElement("div");
    modal.id = "iosInstallModal";
    modal.className = "md3-dialog-overlay";
    modal.hidden = true;
    modal.innerHTML = modalHtml;
    document.body.appendChild(modal);

    // Aktualizuj referencje w obiekcie elements
    elements.iosInstallModal = modal;
    elements.iosInstallCloseBtn = document.getElementById("iosInstallCloseBtn");
  }

  return {
    init
  };
})();

App.init();
