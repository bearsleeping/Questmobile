const storageKey = "worklog.entries.v1";

const storage = (() => {
  let driver;
  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    driver = window.localStorage;
  } catch {
    const memory = new Map();
    driver = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }

  const hooks = { onSet: null, onRemove: null };

  return {
    getItem: (key) => driver.getItem(key),
    setItem: (key, value) => {
      driver.setItem(key, value);
      if (hooks.onSet) hooks.onSet(key, value);
    },
    removeItem: (key) => {
      driver.removeItem(key);
      if (hooks.onRemove) hooks.onRemove(key);
    },
    setHooks: (next) => {
      hooks.onSet = next?.onSet || null;
      hooks.onRemove = next?.onRemove || null;
    },
  };
})();

const supabaseUrl = window.SUPABASE_URL || "";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "";
const supabaseLib = window.supabase;
const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey && supabaseLib?.createClient);
const supabaseClient = supabaseEnabled ? supabaseLib.createClient(supabaseUrl, supabaseAnonKey) : null;
const supabaseSyncTable = "user_storage";
const supabaseCommunityTable = "community_users";
const supabasePlannerTable = "planner_public";
const supabaseProductionTable = "production_entries";
const isDevPage = document.body?.dataset?.devPage === "true";
let supabaseUser = null;
let supabaseSyncSuspended = false;
let lastNonAuthView = "main";
let supabaseCommunityUsers = null;
let supabaseCommunityLoading = false;
let supabasePlannerNotes = null;
let supabasePlannerLoading = false;
let supabaseProductionEntries = null;
let supabaseProductionLoading = false;
let authAudioContext = null;

const plannerUsesSupabase = () => Boolean(supabaseEnabled && supabaseClient && supabaseUser);
const productionUsesSupabase = () => Boolean(supabaseEnabled && supabaseClient && supabaseUser);

const getAuthAudioContext = () => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!authAudioContext) authAudioContext = new AudioCtx();
  if (authAudioContext.state === "suspended") {
    authAudioContext.resume().catch(() => {});
  }
  return authAudioContext;
};

const playAuthTone = (frequency, offset = 0, duration = 0.1, type = "sine", volume = 0.05) => {
  try {
    const ctx = getAuthAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + offset;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  } catch {
    // Ignore audio errors (autoplay restrictions, etc.)
  }
};

const playLoginSound = () => {
  playAuthTone(523, 0, 0.07, "triangle", 0.05);
  playAuthTone(659, 0.07, 0.08, "triangle", 0.05);
  playAuthTone(784, 0.15, 0.1, "triangle", 0.05);
};

const playLogoutSound = () => {
  playAuthTone(784, 0, 0.08, "sawtooth", 0.045);
  playAuthTone(659, 0.08, 0.08, "sawtooth", 0.04);
  playAuthTone(523, 0.16, 0.1, "sawtooth", 0.04);
};

const playClickSound = () => {
  playAuthTone(900, 0, 0.04, "square", 0.03);
};

const playRankUpSound = () => {
  playAuthTone(620, 0, 0.08, "sine", 0.05);
  playAuthTone(920, 0.08, 0.1, "sine", 0.05);
  playAuthTone(1240, 0.18, 0.12, "sine", 0.05);
};

const workForm = document.getElementById("workForm");
const workFormSubmitBtn = document.getElementById("workFormSubmitBtn");
const workFormStatus = document.getElementById("workFormStatus");
const workDate = document.getElementById("workDate");
const workDateDisplayInput = document.getElementById("workDateDisplayInput");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const entriesList = document.getElementById("entriesList");
const clearAllBtn = document.getElementById("clearAllBtn");
const todayHoursEl = document.getElementById("todayHours");
const monthHoursEl = document.getElementById("monthHours");
const streakDaysEl = document.getElementById("streakDays");
const forecastMonthGross = document.getElementById("forecastMonthGross");
const forecastMonthNet = document.getElementById("forecastMonthNet");
const forecastMonthLabel = document.getElementById("forecastMonthLabel");
const forecastRateHint = document.getElementById("forecastRateHint");
const installBanner = document.getElementById("installBanner");
const installBtn = document.getElementById("installBtn");
const installIosBtn = document.getElementById("installIosBtn");
const installCloseBtn = document.getElementById("installCloseBtn");
const iosInstallGuide = document.getElementById("iosInstallGuide");
const iosInstallCloseBtn = document.getElementById("iosInstallCloseBtn");
const iosInstallDoneBtn = document.getElementById("iosInstallDoneBtn");
const viewSections = Array.from(document.querySelectorAll(".view-section"));
const navItems = Array.from(document.querySelectorAll(".md3-navigation-bar .nav-item"));
const editNicknameBtn = document.getElementById("editNicknameBtn");
const topbarLogoutBtn = document.getElementById("topbarLogoutBtn");
const adminAuthModal = document.getElementById("adminAuthModal");
const adminAuthInput = document.getElementById("adminAuthInput");
const adminAuthCloseBtn = document.getElementById("adminAuthCloseBtn");
const adminAuthCancelBtn = document.getElementById("adminAuthCancelBtn");
const adminAuthOkBtn = document.getElementById("adminAuthOkBtn");
const adminAuthError = document.getElementById("adminAuthError");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardEmpty = document.getElementById("leaderboardEmpty");
const leaderboardMeta = document.getElementById("leaderboardMeta");
const rankUpToast = document.getElementById("rankUpToast");
const rankToastTitle = document.getElementById("rankToastTitle");
const rankToastSubtitle = document.getElementById("rankToastSubtitle");
const rankConfetti = document.getElementById("rankConfetti");
const mainProfileRankText = document.getElementById("mainProfileRankText");
const rankBadges = Array.from(document.querySelectorAll(".rank-badge:not([data-static-rank])"));
const weeklyChallengesList = document.getElementById("weeklyChallengesList");
const weeklyChallengesEmpty = document.getElementById("weeklyChallengesEmpty");
const weeklyChallengesMeta = document.getElementById("weeklyChallengesMeta");
const communityList = document.getElementById("communityList");
const communityEmpty = document.getElementById("communityEmpty");
const communityMeta = document.getElementById("communityMeta");
const communityRefreshBtn = document.getElementById("communityRefreshBtn");
const communityProfileModal = document.getElementById("communityProfileModal");
const communityProfileCloseBtn = document.getElementById("communityProfileCloseBtn");
const communityProfileAvatar = document.getElementById("communityProfileAvatar");
const communityProfileName = document.getElementById("communityProfileName");
const communityProfileRankText = document.getElementById("communityProfileRankText");
const communityProfileHours = document.getElementById("communityProfileHours");
const communityProfileAchievements = document.getElementById("communityProfileAchievements");
const communityProfileJoined = document.getElementById("communityProfileJoined");
const communityProfileProgressBar = document.getElementById("communityProfileProgressBar");
const communityProfileLevelText = document.getElementById("communityProfileLevelText");
const communityCalendarPrevBtn = document.getElementById("communityCalendarPrevBtn");
const communityCalendarNextBtn = document.getElementById("communityCalendarNextBtn");
const communityCalendarLabel = document.getElementById("communityCalendarLabel");
const communityCalendarGrid = document.getElementById("communityCalendarGrid");
const communityOverviewPrevBtn = document.getElementById("communityOverviewPrevBtn");
const communityOverviewNextBtn = document.getElementById("communityOverviewNextBtn");
const communityOverviewLabel = document.getElementById("communityOverviewLabel");
const communityOverviewGrid = document.getElementById("communityOverviewGrid");
const communityDayLabel = document.getElementById("communityDayLabel");
const communityDayList = document.getElementById("communityDayList");
const communityDayEmpty = document.getElementById("communityDayEmpty");
const entriesShowMoreBtn = document.getElementById("entriesShowMoreBtn");

const adminPassword = "Klucz";
const adminUnlockKey = "admin.unlocked.v1";
let isAdminUnlocked = sessionStorage.getItem(adminUnlockKey) === "true";

const devPassword = "2312";
const devModeKey = "dev.mode.enabled.v2";
let isDevModeEnabled = storage.getItem(devModeKey) === "true";
const devLevelOverrideKey = "dev.level.override.v2";
let devLevelOverride = null;

const accountEditor = document.getElementById("accountEditor");
const accountCloseBtn = document.getElementById("accountCloseBtn");
const accountCancelBtn = document.getElementById("accountCancelBtn");
const accountSaveBtn = document.getElementById("accountSaveBtn");
const accountNicknameInput = document.getElementById("accountNicknameInput");
const accountAvatarPreview = document.getElementById("accountAvatarPreview");
const accountAvatarFileInput = document.getElementById("accountAvatarFileInput");
const accountFileTriggerBtn = document.getElementById("accountFileTriggerBtn");
const accountAvatarUrlInput = document.getElementById("accountAvatarUrlInput");
const supabaseOpenBtn = document.getElementById("supabaseOpenBtn");
const profileSyncBtn = document.getElementById("profileSyncBtn");
const profileSyncStatus = document.getElementById("profileSyncStatus");
const supabaseBackBtn = document.getElementById("supabaseBackBtn");
const supabaseContinueBtn = document.getElementById("supabaseContinueBtn");
const supabaseStatusEl = document.getElementById("supabaseStatus");
const supabaseEmailInput = document.getElementById("supabaseEmail");
const supabasePasswordInput = document.getElementById("supabasePassword");
const supabaseSignInBtn = document.getElementById("supabaseSignInBtn");
const supabaseSignUpBtn = document.getElementById("supabaseSignUpBtn");
const supabaseSignOutBtn = document.getElementById("supabaseSignOutBtn");
const supabaseSyncBtn = document.getElementById("supabaseSyncBtn");
const supabaseResetBtn = document.getElementById("supabaseResetBtn");
const devModeStatus = document.getElementById("devModeStatus");
const devModeToggleBtn = document.getElementById("devModeToggleBtn");
const devAuthModal = document.getElementById("devAuthModal");
const devAuthInput = document.getElementById("devAuthInput");
const devAuthCloseBtn = document.getElementById("devAuthCloseBtn");
const devAuthCancelBtn = document.getElementById("devAuthCancelBtn");
const devAuthOkBtn = document.getElementById("devAuthOkBtn");
const devAuthError = document.getElementById("devAuthError");
const devToolsPanel = document.getElementById("devToolsPanel");
const devToolsStatus = document.getElementById("devToolsStatus");
const devGateMessage = document.getElementById("devGateMessage");
const devTestNotifyBtn = document.getElementById("devTestNotifyBtn");
const devTestRankToastBtn = document.getElementById("devTestRankToastBtn");
const devTestConfettiBtn = document.getElementById("devTestConfettiBtn");
const devLevelInput = document.getElementById("devLevelInput");
const devProgressInput = document.getElementById("devProgressInput");
const devLevelApplyBtn = document.getElementById("devLevelApplyBtn");
const devLevelPlusBtn = document.getElementById("devLevelPlusBtn");
const devLevelMinusBtn = document.getElementById("devLevelMinusBtn");
const devLevelResetBtn = document.getElementById("devLevelResetBtn");
const devSyncPullBtn = document.getElementById("devSyncPullBtn");
const devSyncPushBtn = document.getElementById("devSyncPushBtn");
const devRemoteRefreshBtn = document.getElementById("devRemoteRefreshBtn");
const devClearEntriesBtn = document.getElementById("devClearEntriesBtn");
const devClearCalendarBtn = document.getElementById("devClearCalendarBtn");
const devClearPlannerBtn = document.getElementById("devClearPlannerBtn");
const devResetLocalBtn = document.getElementById("devResetLocalBtn");
const devSwUpdateBtn = document.getElementById("devSwUpdateBtn");
const devSwUnregisterBtn = document.getElementById("devSwUnregisterBtn");
const devClearCachesBtn = document.getElementById("devClearCachesBtn");
const devReloadBtn = document.getElementById("devReloadBtn");
const devUiRefreshBtn = document.getElementById("devUiRefreshBtn");
const devStorageSummaryBtn = document.getElementById("devStorageSummaryBtn");
const devCopyDebugBtn = document.getElementById("devCopyDebugBtn");
const devExportDataBtn = document.getElementById("devExportDataBtn");
const devImportDataBtn = document.getElementById("devImportDataBtn");
const devImportFileInput = document.getElementById("devImportFileInput");
const devToggleOutlinesBtn = document.getElementById("devToggleOutlinesBtn");
const devToggleNoAnimBtn = document.getElementById("devToggleNoAnimBtn");
const devOutput = document.getElementById("devOutput");

const mainProfileName = document.getElementById("mainProfileName");
const mainProfileAvatar = document.getElementById("mainProfileAvatar");
const connectionDot = document.getElementById("connectionDot");
const connectionStatus = document.getElementById("connectionStatus");

const profileKey = "profile.settings.v1";
const supabaseLastUserKey = "supabase.lastUserId.v1";
const deviceIdKey = "device.id.v1";
const leaderboardKey = "rank.leaderboard.v1";
const rankStateKey = "rank.state.v1";
const weeklyChallengesKey = "weekly.challenges.v1";
const communityKey = "community.users.v1";
const supabaseSyncKeys = new Set([
  "worklog.entries.v1",
  "calendar.events.v1",
  "planner.notes.v1",
  "planner.production.v1",
  "profile.settings.v1",
  "profile.joinedAt.v1",
  "achievements.v1",
  "achievements.batch.v1",
  "achievements.activity.v1",
  "earnings.rate.pln",
  "earnings.under26",
]);
const devExportKeys = [
  storageKey,
  "calendar.events.v1",
  "planner.notes.v1",
  "planner.production.v1",
  profileKey,
  "profile.joinedAt.v1",
  "achievements.v1",
  "achievements.batch.v1",
  "achievements.activity.v1",
  "earnings.rate.pln",
  "earnings.under26",
  leaderboardKey,
  rankStateKey,
  weeklyChallengesKey,
  communityKey,
  devModeKey,
  devLevelOverrideKey,
  deviceIdKey,
];
const communityConfigUrl = "./community-config.json";

const communityConfigFallback = {
  useMock: false,
  mockUsers: [],
};

let communityConfig = communityConfigFallback;

const applyCommunityConfig = (config) => {
  if (!config || typeof config !== "object") return;
  if (Array.isArray(config.mockUsers)) {
    communityConfig = { ...communityConfigFallback, ...config };
  }
};

const loadCommunityConfig = async () => {
  try {
    const response = await fetch(communityConfigUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Fetch failed");
    const data = await response.json();
    applyCommunityConfig(data);
  } catch {
    applyCommunityConfig(communityConfigFallback);
  }
};

const setSupabaseStatus = (message, isError = false) => {
  if (!supabaseStatusEl) return;
  supabaseStatusEl.textContent = message;
  supabaseStatusEl.classList.toggle("text-error", isError);
  supabaseStatusEl.classList.toggle("text-secondary", !isError);
};

const setProfileSyncStatus = (message, isError = false) => {
  if (!profileSyncStatus) return;
  profileSyncStatus.textContent = message;
  profileSyncStatus.classList.toggle("text-error", isError);
  profileSyncStatus.classList.toggle("text-secondary", !isError);
};

let rankToastSuppressed = true;
let rankToastResumeTimer = null;
const suppressRankToast = (duration = 2000) => {
  rankToastSuppressed = true;
  window.clearTimeout(rankToastResumeTimer);
  rankToastResumeTimer = window.setTimeout(() => {
    rankToastSuppressed = false;
  }, duration);
};

const clearLocalUserData = () => {
  const extraKeys = [leaderboardKey, rankStateKey, weeklyChallengesKey, communityKey];
  supabaseSyncSuspended = true;
  supabaseSyncKeys.forEach((key) => storage.removeItem(key));
  extraKeys.forEach((key) => storage.removeItem(key));
  supabaseSyncSuspended = false;
  supabaseCommunityUsers = null;
  supabasePlannerNotes = null;
  supabaseProductionEntries = null;
  if (typeof applyProfileToUI === "function") {
    applyProfileToUI();
  }
};

const hasLocalUserData = () => {
  for (const key of supabaseSyncKeys) {
    if (storage.getItem(key) !== null) return true;
  }
  const extraKeys = [leaderboardKey, rankStateKey, weeklyChallengesKey, communityKey];
  for (const key of extraKeys) {
    if (storage.getItem(key) !== null) return true;
  }
  return false;
};

const handleSupabaseUserSwitch = (nextUserId) => {
  if (!nextUserId) return;
  const prevUserId = storage.getItem(supabaseLastUserKey);
  if (!prevUserId) {
    if (hasLocalUserData()) {
      clearLocalUserData();
    }
  } else if (prevUserId !== nextUserId) {
    clearLocalUserData();
  }
  storage.setItem(supabaseLastUserKey, nextUserId);
};

const updateConnectionIndicator = () => {
  const authed = Boolean(supabaseEnabled && supabaseUser);
  const online = navigator.onLine;
  let state = "offline";
  let label = "Rozłączony";

  if (authed && online) {
    state = "online";
    label = "Połączony";
  } else if (authed && !online) {
    state = "connecting";
    label = "Wstrzymano";
  }

  if (connectionDot) {
    connectionDot.classList.remove("connection-dot--online", "connection-dot--connecting", "connection-dot--offline");
    connectionDot.classList.add(`connection-dot--${state}`);
    connectionDot.setAttribute("aria-label", `Status połączenia: ${label}`);
  }
  if (connectionStatus) {
    connectionStatus.textContent = "";
  }
};

const buildCommunityPayload = () => {
  const currentEntries = getEntriesSafe();
  const currentEvents = loadCalendarEvents();
  const currentJoin = getProfileJoinDate();
  const currentProfile = loadProfile();
  const currentAvatarUrl = currentProfile.avatarUrl || "";
  const totalExp = computeTotalExpForEntries(currentEntries);
  const { level, progress } = computeLevelingFromExp(totalExp);
  const { rankName } = getRankInfo(level);
  const achievements = loadAchievements().filter((item) => item.unlocked).length;
  const today = new Date().toISOString().slice(0, 10);
  const status = getStatusForDate(currentEntries, currentEvents, today);
  const liveStatus = getLiveWorkStatus(currentEntries, today);

  return {
    user_id: supabaseUser?.id,
    name: currentProfile.name || "Gość",
    avatar_url: currentAvatarUrl,
    joined_at: currentJoin,
    total_hours: currentEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0),
    level,
    level_progress: progress,
    rank_name: rankName,
    achievements,
    status,
    live_status: liveStatus,
    entries: currentEntries,
    events: currentEvents,
    updated_at: new Date().toISOString(),
  };
};

const normalizeCommunityUser = (row) => {
  const entries = Array.isArray(row?.entries) ? row.entries : [];
  const events = Array.isArray(row?.events) ? row.events : [];
  const exp = computeTotalExpForEntries(entries);
  const { level, progress } = computeLevelingFromExp(exp);
  const { rankName: computedRankName } = getRankInfo(level);
  const todayStr = new Date().toISOString().slice(0, 10);
  return {
    id: row?.user_id || row?.id || "",
    name: row?.name || "Użytkownik",
    avatarUrl: row?.avatar_url || "",
    joinedAt: row?.joined_at || "",
    totalHours: entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0),
    level,
    levelProgress: progress,
    rankName: computedRankName,
    achievements: Number.isFinite(Number(row?.achievements)) ? Number(row.achievements) : 0,
    status: row?.status && typeof row.status === "object" ? row.status : getStatusForDate(entries, events, todayStr),
    liveStatus:
      row?.live_status && typeof row.live_status === "object" ? row.live_status : getLiveWorkStatus(entries, todayStr),
    entries,
    events,
  };
};

const fetchCommunityUsersFromSupabase = async () => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser) return false;
  if (supabaseCommunityLoading) return false;
  supabaseCommunityLoading = true;
  try {
    const { data, error } = await supabaseClient
      .from(supabaseCommunityTable)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    supabaseCommunityLoading = false;
    if (error) {
      setSupabaseStatus("Błąd pobierania społeczności.", true);
      return false;
    }
    supabaseCommunityUsers = Array.isArray(data) ? data.map(normalizeCommunityUser) : [];
    return true;
  } catch {
    supabaseCommunityLoading = false;
    setSupabaseStatus("Błąd pobierania społeczności.", true);
    return false;
  }
};

const refreshCommunityFromSupabase = () => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser) return;
  fetchCommunityUsersFromSupabase().then((updated) => {
    if (!updated) return;
    renderCommunityList();
    renderCommunityOverview();
  });
};

const normalizeProductionRow = (row) => ({
  id: row?.id || "",
  date: row?.date || "",
  product: row?.product || "",
  qty: Number(row?.qty) || 0,
  createdBy: row?.created_by || "",
  authorName: row?.author_name || "",
  authorAvatar: row?.author_avatar || "",
  createdAt: row?.created_at || "",
});

const fetchProductionFromSupabase = async (dateFilter = "") => {
  if (!productionUsesSupabase()) return false;
  if (supabaseProductionLoading) return false;
  supabaseProductionLoading = true;
  try {
    let query = supabaseClient
      .from(supabaseProductionTable)
      .select("*")
      .order("created_at", { ascending: false });
    if (dateFilter) {
      query = query.eq("date", dateFilter);
    }
    const { data, error } = await query;
    supabaseProductionLoading = false;
    if (error) {
      setSupabaseStatus("Błąd pobierania produkcji.", true);
      return false;
    }
    supabaseProductionEntries = Array.isArray(data) ? data.map(normalizeProductionRow) : [];
    return true;
  } catch {
    supabaseProductionLoading = false;
    setSupabaseStatus("Błąd pobierania produkcji.", true);
    return false;
  }
};

const refreshProductionFromSupabase = (dateFilter = "") => {
  if (!productionUsesSupabase()) return;
  fetchProductionFromSupabase(dateFilter).then(() => {
    renderProductionList();
  });
};

const updateSupabaseAuthUI = () => {
  if (supabaseOpenBtn) {
    supabaseOpenBtn.disabled = !supabaseEnabled;
  }
  if (profileSyncBtn) {
    profileSyncBtn.disabled = !supabaseEnabled;
  }
  if (topbarLogoutBtn) {
    const isAuthed = Boolean(supabaseEnabled && supabaseUser);
    topbarLogoutBtn.hidden = false;
    topbarLogoutBtn.dataset.state = isAuthed ? "logout" : "login";
    topbarLogoutBtn.setAttribute("aria-label", isAuthed ? "Wyloguj" : "Zaloguj");
    topbarLogoutBtn.title = isAuthed ? "Wyloguj" : "Zaloguj";
  }
  if (!supabaseEnabled) {
    setSupabaseStatus("Supabase nie jest skonfigurowany.", true);
    setProfileSyncStatus("Chmura wyłączona", true);
    if (supabaseEmailInput) supabaseEmailInput.disabled = true;
    if (supabasePasswordInput) supabasePasswordInput.disabled = true;
    if (supabaseSignInBtn) supabaseSignInBtn.disabled = true;
    if (supabaseSignUpBtn) supabaseSignUpBtn.disabled = true;
    if (supabaseSyncBtn) supabaseSyncBtn.disabled = true;
    if (supabaseContinueBtn) supabaseContinueBtn.hidden = false;
    if (supabaseBackBtn) supabaseBackBtn.hidden = true;
    return;
  }
  const isAuthed = Boolean(supabaseUser);
  if (supabaseSignOutBtn) supabaseSignOutBtn.hidden = !isAuthed;
  if (supabaseSignInBtn) supabaseSignInBtn.hidden = isAuthed;
  if (supabaseSignUpBtn) supabaseSignUpBtn.hidden = isAuthed;
  if (supabaseEmailInput) supabaseEmailInput.disabled = isAuthed;
  if (supabasePasswordInput) supabasePasswordInput.disabled = isAuthed;
  if (supabaseSyncBtn) supabaseSyncBtn.disabled = !isAuthed;
  if (supabaseBackBtn) supabaseBackBtn.hidden = !isAuthed;
  if (supabaseContinueBtn) supabaseContinueBtn.hidden = true;
  if (isAuthed) {
    const label = supabaseUser?.email ? `Połączono jako ${supabaseUser.email}.` : "Połączono z Supabase.";
    setSupabaseStatus(label);
    setProfileSyncStatus("Gotowe");
  } else {
    setSupabaseStatus("Brak połączenia z Supabase.");
    setProfileSyncStatus("Brak połączenia", true);
  }
  updateConnectionIndicator();
};

const openSupabaseAuthView = () => {
  updateSupabaseAuthUI();
  setActiveViewInternal("auth");
};

const closeSupabaseAuthView = () => {
  if (supabaseEnabled && !supabaseUser) {
    setSupabaseStatus("Zaloguj się, aby wejść do aplikacji.", true);
    setActiveViewInternal("auth");
    return;
  }
  setActiveViewInternal(lastNonAuthView || "main");
};

const maybeShowSupabaseAuthView = () => {
  if (!supabaseEnabled) return;
  if (supabaseUser) {
    if (document.body.classList.contains("auth-mode")) {
      closeSupabaseAuthView();
    }
    return;
  }
  openSupabaseAuthView();
};

const handleSupabaseWrite = async (key, value) => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser || supabaseSyncSuspended) return;
  if (!supabaseSyncKeys.has(key)) return;
  try {
    const now = new Date().toISOString();
    const payload = { user_id: supabaseUser.id, key, value: String(value ?? ""), updated_at: now };
    const { error } = await supabaseClient
      .from(supabaseSyncTable)
      .upsert(payload, { onConflict: "user_id,key" });
    if (error) {
      setSupabaseStatus("Błąd zapisu do chmury.", true);
    }
  } catch {
    setSupabaseStatus("Błąd zapisu do chmury.", true);
  }
};

const handleSupabaseRemove = async (key) => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser || supabaseSyncSuspended) return;
  if (!supabaseSyncKeys.has(key)) return;
  try {
    const { error } = await supabaseClient
      .from(supabaseSyncTable)
      .delete()
      .eq("user_id", supabaseUser.id)
      .eq("key", key);
    if (error) {
      setSupabaseStatus("Błąd usuwania z chmury.", true);
    }
  } catch {
    setSupabaseStatus("Błąd usuwania z chmury.", true);
  }
};

const pushAllToSupabase = async () => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser) return;
  const now = new Date().toISOString();
  const payload = [];
  supabaseSyncKeys.forEach((key) => {
    const value = storage.getItem(key);
    if (value === null || value === undefined) return;
    payload.push({ user_id: supabaseUser.id, key, value: String(value), updated_at: now });
  });
  if (!payload.length) return;
  const { error } = await supabaseClient
    .from(supabaseSyncTable)
    .upsert(payload, { onConflict: "user_id,key" });
  if (error) {
    setSupabaseStatus("Błąd synchronizacji danych.", true);
  }
};

const pullSupabaseToLocal = async () => {
  if (!supabaseEnabled || !supabaseClient || !supabaseUser) return;
  suppressRankToast(2500);
  const { data, error } = await supabaseClient
    .from(supabaseSyncTable)
    .select("user_id,key,value,updated_at")
    .eq("user_id", supabaseUser.id);
  if (error) {
    setSupabaseStatus("Błąd pobierania danych z chmury.", true);
    return;
  }
  if (!Array.isArray(data) || data.length === 0) {
    await pushAllToSupabase();
    setSupabaseStatus("Wysłano lokalne dane do chmury.");
    return;
  }
  supabaseSyncSuspended = true;
  data.forEach((row) => {
    if (!row?.key || !supabaseSyncKeys.has(row.key)) return;
    if (row?.user_id && row.user_id !== supabaseUser.id) return;
    storage.setItem(row.key, row.value ?? "");
  });
  supabaseSyncSuspended = false;
  setSupabaseStatus("Pobrano dane z chmury.");
  if (typeof applyProfileToUI === "function") {
    applyProfileToUI();
  }
  if (typeof refreshAll === "function") {
    refreshAll();
  }
  if (typeof renderAchievements === "function") {
    renderAchievements();
  }
};

const signInSupabase = async () => {
  if (!supabaseEnabled || !supabaseClient) return;
  const email = supabaseEmailInput?.value?.trim() || "";
  const password = supabasePasswordInput?.value || "";
  if (!email || !password) {
    setSupabaseStatus("Podaj email i hasło.", true);
    return;
  }
  setSupabaseStatus("Logowanie...");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setSupabaseStatus("Błąd logowania.", true);
    return;
  }
  supabaseUser = data?.user || data?.session?.user || null;
  handleSupabaseUserSwitch(supabaseUser?.id);
  updateSupabaseAuthUI();
  if (supabaseUser) {
    playLoginSound();
    await pullSupabaseToLocal();
    closeSupabaseAuthView();
  }
};

const signUpSupabase = async () => {
  if (!supabaseEnabled || !supabaseClient) return;
  const email = supabaseEmailInput?.value?.trim() || "";
  const password = supabasePasswordInput?.value || "";
  if (!email || !password) {
    setSupabaseStatus("Podaj email i hasło.", true);
    return;
  }
  setSupabaseStatus("Rejestracja...");
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    setSupabaseStatus("Błąd rejestracji.", true);
    return;
  }
  supabaseUser = data?.user || data?.session?.user || null;
  handleSupabaseUserSwitch(supabaseUser?.id);
  updateSupabaseAuthUI();
  if (supabaseUser) {
    playLoginSound();
    await pushAllToSupabase();
    setSupabaseStatus("Zarejestrowano i zsynchronizowano dane.");
    closeSupabaseAuthView();
  } else {
    setSupabaseStatus("Sprawdź email, aby potwierdzić rejestrację.");
  }
};

const signOutSupabase = async () => {
  if (!supabaseEnabled || !supabaseClient) return;
  setSupabaseStatus("Wylogowywanie...");
  await supabaseClient.auth.signOut();
  supabaseUser = null;
  supabasePlannerNotes = null;
  supabaseProductionEntries = null;
  updateSupabaseAuthUI();
  playLogoutSound();
  setSupabaseStatus("Wylogowano.");
  maybeShowSupabaseAuthView();
};

const resetLocalSupabaseData = async () => {
  const ok = await showConfirmDialog(
    "To usunie lokalne dane aplikacji (wpisy, planer, ustawienia). Dane w chmurze pozostaną bez zmian.",
    "Reset danych lokalnych"
  );
  if (!ok) return;
  const extraKeys = [leaderboardKey, rankStateKey, weeklyChallengesKey, communityKey];
  supabaseSyncSuspended = true;
  supabaseSyncKeys.forEach((key) => storage.removeItem(key));
  extraKeys.forEach((key) => storage.removeItem(key));
  supabaseSyncSuspended = false;
  supabaseCommunityUsers = null;
  if (typeof applyProfileToUI === "function") applyProfileToUI();
  if (typeof updateRankUI === "function") updateRankUI();
  if (typeof refreshAll === "function") refreshAll();
  if (typeof renderAchievements === "function") renderAchievements();
  setSupabaseStatus("Wyczyszczono lokalne dane.");
};

const initSupabase = () => {
  updateSupabaseAuthUI();
  if (!supabaseEnabled || !supabaseClient) {
    if (!isDevPage) {
      setActiveViewInternal("auth");
    }
    return;
  }
  storage.setHooks({ onSet: handleSupabaseWrite, onRemove: handleSupabaseRemove });
  supabaseClient.auth.getSession().then(({ data }) => {
    supabaseUser = data?.session?.user || null;
    handleSupabaseUserSwitch(supabaseUser?.id);
    updateSupabaseAuthUI();
    if (supabaseUser) {
      pullSupabaseToLocal();
      refreshCommunityFromSupabase();
      refreshPlannerFromSupabase({ syncLocal: true });
      refreshProductionFromSupabase(getTodayKey());
    }
    maybeShowSupabaseAuthView();
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    supabaseUser = session?.user || null;
    handleSupabaseUserSwitch(supabaseUser?.id);
    updateSupabaseAuthUI();
    if (supabaseUser) {
      pullSupabaseToLocal();
      refreshCommunityFromSupabase();
      refreshPlannerFromSupabase({ syncLocal: true });
      refreshProductionFromSupabase(getTodayKey());
    }
    maybeShowSupabaseAuthView();
  });
};
const joinDateKey = "profile.joinedAt.v1";

let communityCalendarOffset = 0;
let currentCommunityUser = null;
let communityOverviewOffset = 0;
let communitySelectedDate = null;

const loadProfile = () => {
  const raw = storage.getItem(profileKey);
  if (!raw) return { name: "Gość", avatarUrl: "" };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { name: "Gość", avatarUrl: "" };
    }
    const name = typeof parsed.name === "string" ? parsed.name : "Gość";
    const avatarUrl = typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : "";
    return { name, avatarUrl };
  } catch {
    return { name: "Gość", avatarUrl: "" };
  }
};

const saveProfile = (profile) => {
  storage.setItem(profileKey, JSON.stringify(profile));
};

const getDeviceId = () => {
  const existing = storage.getItem(deviceIdKey);
  if (existing) return existing;
  const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  storage.setItem(deviceIdKey, id);
  return id;
};

const loadLeaderboardLocal = () => {
  const raw = storage.getItem(leaderboardKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLeaderboardLocal = (items) => {
  storage.setItem(leaderboardKey, JSON.stringify(items));
};

const loadRankState = () => {
  const raw = storage.getItem(rankStateKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveRankState = (state) => {
  storage.setItem(rankStateKey, JSON.stringify(state));
};

const fetchLeaderboardRemote = async () => {
  // TODO: Replace with backend fetch when ready.
  return null;
};

const fetchWeeklyChallengesCatalog = async () => {
  try {
    const res = await fetch("./weekly-challenges.json", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const getInitial = (name) => {
  if (!name) return "U";
  const trimmed = name.trim();
  if (!trimmed) return "U";
  return trimmed[0].toUpperCase();
};

const setAvatar = (el, avatarUrl, name) => {
  if (!el) return;
  el.innerHTML = "";
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = name || "Avatar";
    el.appendChild(img);
  } else {
    el.textContent = getInitial(name);
  }
};

const applyProfileToUI = () => {
  const { name, avatarUrl } = loadProfile();
  if (mainProfileName) mainProfileName.textContent = name || "Gość";
  setAvatar(mainProfileAvatar, avatarUrl, name);
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const loadDevLevelOverride = () => {
  const raw = storage.getItem(devLevelOverrideKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const level = Number(parsed?.level);
    if (!Number.isFinite(level)) return null;
    const progress = clampNumber(Number(parsed?.progress ?? 0), 0, 1);
    return { level: Math.max(1, Math.floor(level)), progress };
  } catch {
    return null;
  }
};

const saveDevLevelOverride = (override) => {
  if (!override) {
    storage.removeItem(devLevelOverrideKey);
    return;
  }
  storage.setItem(devLevelOverrideKey, JSON.stringify(override));
};

const setDevToolsStatus = (message) => {
  if (devToolsStatus) devToolsStatus.textContent = message || "";
};

const setDevOutput = (text) => {
  if (devOutput) devOutput.value = text || "";
};

const requireDevMode = (message) => {
  if (isDevModeEnabled) return true;
  setDevToolsStatus(message || "Wlacz tryb developerski, aby testowac.");
  return false;
};

const syncDevLevelInputs = () => {
  if (!devLevelInput || !devProgressInput) return;
  if (!devLevelOverride) {
    devLevelInput.value = "";
    devProgressInput.value = "";
    return;
  }
  devLevelInput.value = String(devLevelOverride.level);
  devProgressInput.value = String(Math.round((devLevelOverride.progress || 0) * 100));
};

devLevelOverride = loadDevLevelOverride();

const updateDevModeUI = () => {
  if (devModeStatus) devModeStatus.textContent = isDevModeEnabled ? "Włączony" : "Wyłączony";
  if (devModeToggleBtn) devModeToggleBtn.textContent = isDevModeEnabled ? "Wyłącz" : "Włącz";
  if (devToolsPanel) devToolsPanel.hidden = !isDevModeEnabled;
  if (devGateMessage) devGateMessage.hidden = isDevModeEnabled;
  if (isDevModeEnabled) {
    syncDevLevelInputs();
  } else {
    setDevToolsStatus("");
  }
};

const openDevAuth = () => {
  if (!devAuthModal) return;
  if (devAuthError) devAuthError.hidden = true;
  if (devAuthInput) devAuthInput.value = "";
  devAuthModal.hidden = false;
  devAuthInput?.focus();
};

const closeDevAuth = () => {
  if (!devAuthModal) return;
  devAuthModal.hidden = true;
};

const tryUnlockDev = () => {
  const value = devAuthInput?.value || "";
  if (value === devPassword) {
    isDevModeEnabled = true;
    storage.setItem(devModeKey, "true");
    updateDevModeUI();
    updateRankUI();
    closeDevAuth();
    return;
  }
  if (devAuthError) devAuthError.hidden = false;
};

const setDevLevelOverride = (level, progress = 0) => {
  if (!isDevModeEnabled) {
    setDevToolsStatus("Włącz tryb developerski, aby testować poziom.");
    return;
  }
  const safeLevel = clampNumber(Math.floor(Number(level) || 1), 1, 999);
  const safeProgress = clampNumber(Number(progress) || 0, 0, 1);
  devLevelOverride = { level: safeLevel, progress: safeProgress };
  saveDevLevelOverride(devLevelOverride);
  syncDevLevelInputs();
  updateRankUI();
};

const clearDevLevelOverride = () => {
  devLevelOverride = null;
  saveDevLevelOverride(null);
  syncDevLevelInputs();
  updateRankUI();
};

const runTestNotification = async () => {
  if (!isDevModeEnabled) {
    setDevToolsStatus("Włącz tryb developerski, aby testować.");
    return;
  }
  if (!("Notification" in window)) {
    setDevToolsStatus("Powiadomienia niedostępne w tej przeglądarce.");
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    setDevToolsStatus("Brak zgody na powiadomienia.");
    return;
  }
  const payload = {
    body: "Powiadomienie testowe",
    icon: "assets/icons/icon-192.png",
    badge: "assets/icons/icon-192.png",
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification("Quest — test", payload);
      setDevToolsStatus("Wysłano powiadomienie testowe.");
      return;
    }
  } catch {
    // ignore and fallback
  }
  try {
    new Notification("Quest — test", payload);
    setDevToolsStatus("Wysłano powiadomienie testowe.");
  } catch {
    setDevToolsStatus("Nie udało się wysłać powiadomienia.");
  }
};

const runTestRankToast = () => {
  if (!isDevModeEnabled) {
    setDevToolsStatus("Włącz tryb developerski, aby testować.");
    return;
  }
  showRankToast("Test Rangi", 99);
  fireConfetti();
  setDevToolsStatus("Wyświetlono test awansu.");
};

const runTestConfetti = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby testowac.")) return;
  fireConfetti();
  setDevToolsStatus("Wywolano konfetti.");
};

const devSyncPull = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby synchronizowac.")) return;
  if (!supabaseEnabled) {
    setDevToolsStatus("Supabase nie jest skonfigurowany.");
    return;
  }
  if (!supabaseUser) {
    setDevToolsStatus("Zaloguj sie do Supabase.");
    return;
  }
  setDevToolsStatus("Pobieranie danych...");
  try {
    await pullSupabaseToLocal();
    setDevToolsStatus("Pobrano dane z chmury.");
  } catch {
    setDevToolsStatus("Blad pobierania danych.");
  }
};

const devSyncPush = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby synchronizowac.")) return;
  if (!supabaseEnabled) {
    setDevToolsStatus("Supabase nie jest skonfigurowany.");
    return;
  }
  if (!supabaseUser) {
    setDevToolsStatus("Zaloguj sie do Supabase.");
    return;
  }
  setDevToolsStatus("Wysylanie danych...");
  try {
    await pushAllToSupabase();
    setDevToolsStatus("Wyslano dane do chmury.");
  } catch {
    setDevToolsStatus("Blad wysylania danych.");
  }
};

const devRefreshRemote = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby odswiezac.")) return;
  setDevToolsStatus("Odswiezanie konfiguracji...");
  try {
    await refreshRemoteData(true);
    setDevToolsStatus("Odswiezono konfiguracje.");
  } catch {
    setDevToolsStatus("Blad odswiezania konfiguracji.");
  }
};

const devClearEntries = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby czyscic dane.")) return;
  if (!window.confirm("Wyczyscic wszystkie wpisy pracy?")) return;
  saveEntriesSafe([]);
  refreshAll();
  setDevToolsStatus("Wyczyszczono wpisy pracy.");
};

const devClearCalendar = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby czyscic dane.")) return;
  if (!window.confirm("Wyczyscic wszystkie zdarzenia kalendarza?")) return;
  saveCalendarEvents([]);
  if (typeof window.renderCalendar === "function") {
    window.renderCalendar();
  }
  setDevToolsStatus("Wyczyszczono kalendarz.");
};

const devClearPlanner = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby czyscic dane.")) return;
  if (!window.confirm("Wyczyscic planer i produkcje?")) return;
  savePlannerNotesLocal([]);
  saveProductionEntries([]);
  if (typeof renderPlannerNotes === "function") renderPlannerNotes();
  if (typeof renderPlannerCalendar === "function") renderPlannerCalendar();
  if (typeof renderPlannerDayAgenda === "function") renderPlannerDayAgenda();
  if (typeof renderProductionList === "function") renderProductionList();
  setDevToolsStatus("Wyczyszczono planer.");
};

const devResetLocalData = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby czyscic dane.")) return;
  if (!window.confirm("Wyczyscic lokalne dane aplikacji?")) return;
  const keysToRemove = new Set([
    ...supabaseSyncKeys,
    leaderboardKey,
    rankStateKey,
    weeklyChallengesKey,
    communityKey,
  ]);
  keysToRemove.forEach((key) => storage.removeItem(key));
  refreshAll();
  setDevToolsStatus("Wyczyszczono lokalne dane.");
};

const devUpdateSw = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby zarzadzac SW.")) return;
  if (!("serviceWorker" in navigator)) {
    setDevToolsStatus("Service Worker niedostepny.");
    return;
  }
  setDevToolsStatus("Sprawdzanie aktualizacji SW...");
  try {
    await requestSwUpdate();
    setDevToolsStatus("Zadano aktualizacje SW.");
  } catch {
    setDevToolsStatus("Blad aktualizacji SW.");
  }
};

const devUnregisterSw = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby zarzadzac SW.")) return;
  if (!("serviceWorker" in navigator)) {
    setDevToolsStatus("Service Worker niedostepny.");
    return;
  }
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    setDevToolsStatus(regs.length ? "Wyrejestrowano SW." : "Brak rejestracji SW.");
  } catch {
    setDevToolsStatus("Blad wyrejestrowania SW.");
  }
};

const devClearCaches = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby czyscic cache.")) return;
  if (!("caches" in window)) {
    setDevToolsStatus("Cache API niedostepne.");
    return;
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    setDevToolsStatus(keys.length ? "Wyczyszczono cache." : "Brak cache do usuniecia.");
  } catch {
    setDevToolsStatus("Blad czyszczenia cache.");
  }
};

const devReload = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby przeladowac.")) return;
  window.location.reload();
};

const buildDevSnapshot = () => {
  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: {
      isDevPage,
      isDevModeEnabled,
      online: navigator.onLine,
      supabaseEnabled,
      supabaseUser: supabaseUser?.email || supabaseUser?.id || null,
    },
    keys: {},
  };
  devExportKeys.forEach((key) => {
    const raw = storage.getItem(key);
    if (raw === null) return;
    try {
      snapshot.keys[key] = JSON.parse(raw);
    } catch {
      snapshot.keys[key] = raw;
    }
  });
  return snapshot;
};

const devCopyDebug = async () => {
  if (!requireDevMode("Wlacz tryb developerski, aby kopiowac.")) return;
  const payload = buildDevSnapshot();
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setDevToolsStatus("Skopiowano debug do schowka.");
  } catch {
    setDevToolsStatus("Nie udalo sie skopiowac debug.");
  }
  setDevOutput(text);
};

const devExportData = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby eksportowac.")) return;
  const payload = buildDevSnapshot();
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `quest-debug-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setDevToolsStatus("Wyeksportowano dane.");
  setDevOutput(text);
};

const applyDevSnapshot = (snapshot) => {
  const keys = snapshot?.keys;
  if (!keys || typeof keys !== "object") return false;
  Object.keys(keys).forEach((key) => {
    if (!devExportKeys.includes(key)) return;
    const value = keys[key];
    if (value === null || value === undefined) {
      storage.removeItem(key);
      return;
    }
    if (typeof value === "string") {
      storage.setItem(key, value);
      return;
    }
    storage.setItem(key, JSON.stringify(value));
  });
  return true;
};

const devImportDataFromFile = (file) => {
  if (!requireDevMode("Wlacz tryb developerski, aby importowac.")) return;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        setDevToolsStatus("Nieprawidlowy plik JSON.");
        return;
      }
      const ok = window.confirm("Zastapic lokalne dane danymi z pliku?");
      if (!ok) return;
      const applied = applyDevSnapshot(parsed);
      if (!applied) {
        setDevToolsStatus("Plik nie zawiera danych do importu.");
        return;
      }
      updateDevModeUI();
      refreshAll();
      setDevToolsStatus("Zaimportowano dane.");
      setDevOutput(JSON.stringify(parsed, null, 2));
    } catch {
      setDevToolsStatus("Blad importu danych.");
    }
  };
  reader.readAsText(file);
};

const devStorageSummary = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby sprawdzac dane.")) return;
  const entries = loadEntriesSafe();
  const calendar = loadCalendarEvents();
  const plannerNotes = loadPlannerNotesLocal();
  const production = loadProductionEntries();
  const profile = loadProfile();
  const summary = {
    entries: entries.length,
    calendarEvents: calendar.length,
    plannerNotes: plannerNotes.length,
    productionItems: production.length,
    profileName: profile?.name || "—",
    devMode: isDevModeEnabled,
    supabaseEnabled,
    supabaseUser: supabaseUser?.email || supabaseUser?.id || null,
    online: navigator.onLine,
  };
  const text = JSON.stringify(summary, null, 2);
  setDevOutput(text);
  setDevToolsStatus("Wyswietlono podsumowanie danych.");
};

const devUiRefresh = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby odswiezac UI.")) return;
  refreshAll();
  if (typeof renderPlannerNotes === "function") renderPlannerNotes();
  if (typeof renderPlannerCalendar === "function") renderPlannerCalendar();
  if (typeof renderPlannerDayAgenda === "function") renderPlannerDayAgenda();
  if (typeof renderProductionList === "function") renderProductionList();
  setDevToolsStatus("Odswiezono UI.");
};

const devToggleOutlines = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby debugowac UI.")) return;
  document.body.classList.toggle("dev-outlines");
  setDevToolsStatus(
    document.body.classList.contains("dev-outlines") ? "Wlaczono kontury UI." : "Wylaczono kontury UI."
  );
};

const devToggleNoAnim = () => {
  if (!requireDevMode("Wlacz tryb developerski, aby debugowac UI.")) return;
  document.body.classList.toggle("dev-no-anim");
  setDevToolsStatus(
    document.body.classList.contains("dev-no-anim") ? "Wylaczono animacje." : "Wlaczono animacje."
  );
};

const showAccountEditor = (show) => {
  if (!accountEditor) return;
  accountEditor.hidden = !show;
};

const openAccountEditor = () => {
  const { name, avatarUrl } = loadProfile();
  if (accountNicknameInput) accountNicknameInput.value = name || "";
  if (accountAvatarUrlInput) accountAvatarUrlInput.value = avatarUrl || "";
  setAvatar(accountAvatarPreview, avatarUrl, name);
  showAccountEditor(true);
};

if (editNicknameBtn) {
  editNicknameBtn.addEventListener("click", openAccountEditor);
}
if (accountCloseBtn) {
  accountCloseBtn.addEventListener("click", () => showAccountEditor(false));
}
if (accountCancelBtn) {
  accountCancelBtn.addEventListener("click", () => showAccountEditor(false));
}
if (accountFileTriggerBtn && accountAvatarFileInput) {
  accountFileTriggerBtn.addEventListener("click", () => accountAvatarFileInput.click());
}
if (accountAvatarFileInput) {
  accountAvatarFileInput.addEventListener("change", () => {
    const file = accountAvatarFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (accountAvatarUrlInput) accountAvatarUrlInput.value = dataUrl;
      const name = accountNicknameInput?.value || "Gość";
      setAvatar(accountAvatarPreview, dataUrl, name);
    };
    reader.readAsDataURL(file);
  });
}
if (accountSaveBtn) {
  accountSaveBtn.addEventListener("click", () => {
    const name = accountNicknameInput?.value?.trim() || "Gość";
    const avatarUrl = accountAvatarUrlInput?.value || "";
    saveProfile({ name, avatarUrl });
    applyProfileToUI();
    upsertCurrentUserToCommunity();
    showAccountEditor(false);
  });
}

if (supabaseSignInBtn) {
  supabaseSignInBtn.addEventListener("click", () => {
    signInSupabase();
  });
}
if (supabaseSignUpBtn) {
  supabaseSignUpBtn.addEventListener("click", () => {
    signUpSupabase();
  });
}
if (supabaseSignOutBtn) {
  supabaseSignOutBtn.addEventListener("click", () => {
    signOutSupabase();
  });
}
if (topbarLogoutBtn) {
  topbarLogoutBtn.addEventListener("click", () => {
    if (supabaseEnabled && supabaseUser) {
      signOutSupabase();
      return;
    }
    openSupabaseAuthView();
  });
}
if (supabaseOpenBtn) {
  supabaseOpenBtn.addEventListener("click", () => {
    showAccountEditor(false);
    openSupabaseAuthView();
  });
}
if (supabaseBackBtn) {
  supabaseBackBtn.addEventListener("click", () => closeSupabaseAuthView());
}
if (supabaseContinueBtn) {
  supabaseContinueBtn.addEventListener("click", () => {
    if (supabaseEnabled) return;
    setActiveViewInternal("main");
  });
}
if (supabaseSyncBtn) {
  supabaseSyncBtn.addEventListener("click", () => {
    if (!supabaseUser) {
      setSupabaseStatus("Zaloguj się, aby synchronizować.", true);
      return;
    }
    setSupabaseStatus("Synchronizacja...");
    pullSupabaseToLocal();
  });
}
if (profileSyncBtn) {
  profileSyncBtn.addEventListener("click", async () => {
    if (!supabaseEnabled) {
      setProfileSyncStatus("Chmura wyłączona", true);
      return;
    }
    if (!supabaseUser) {
      setProfileSyncStatus("Zaloguj się", true);
      showAccountEditor(false);
      openSupabaseAuthView();
      return;
    }
    setProfileSyncStatus("Synchronizacja...");
    await pullSupabaseToLocal();
    setProfileSyncStatus("Gotowe");
  });
}
if (supabaseResetBtn) {
  supabaseResetBtn.addEventListener("click", () => {
    resetLocalSupabaseData();
  });
}

applyProfileToUI();
updateDevModeUI();

if (devModeToggleBtn) {
  devModeToggleBtn.addEventListener("click", () => {
    if (isDevModeEnabled) {
      isDevModeEnabled = false;
      storage.setItem(devModeKey, "false");
      clearDevLevelOverride();
      updateDevModeUI();
      updateRankUI();
      return;
    }
    openDevAuth();
  });
}
if (devAuthCloseBtn) {
  devAuthCloseBtn.addEventListener("click", closeDevAuth);
}
if (devAuthCancelBtn) {
  devAuthCancelBtn.addEventListener("click", closeDevAuth);
}
if (devAuthOkBtn) {
  devAuthOkBtn.addEventListener("click", tryUnlockDev);
}
if (devAuthInput) {
  devAuthInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      tryUnlockDev();
    }
  });
}
if (devTestNotifyBtn) {
  devTestNotifyBtn.addEventListener("click", () => runTestNotification());
}
if (devTestRankToastBtn) {
  devTestRankToastBtn.addEventListener("click", runTestRankToast);
}
if (devLevelApplyBtn) {
  devLevelApplyBtn.addEventListener("click", () => {
    const level = Number(devLevelInput?.value);
    const progressRaw = Number(devProgressInput?.value);
    if (!Number.isFinite(level) || level < 1) {
      setDevToolsStatus("Podaj poprawny poziom.");
      return;
    }
    const progress = clampNumber(progressRaw / 100, 0, 1);
    setDevLevelOverride(level, progress);
    setDevToolsStatus("Ustawiono poziom testowy.");
  });
}
if (devLevelPlusBtn) {
  devLevelPlusBtn.addEventListener("click", () => {
    const current = devLevelOverride?.level || computeLevelingFromExp(getEffectiveTotalExp()).level;
    const progress = devLevelOverride?.progress ?? 0;
    setDevLevelOverride(current + 1, progress);
  });
}
if (devLevelMinusBtn) {
  devLevelMinusBtn.addEventListener("click", () => {
    const current = devLevelOverride?.level || computeLevelingFromExp(getEffectiveTotalExp()).level;
    const progress = devLevelOverride?.progress ?? 0;
    setDevLevelOverride(Math.max(1, current - 1), progress);
  });
}
if (devLevelResetBtn) {
  devLevelResetBtn.addEventListener("click", () => {
    clearDevLevelOverride();
    setDevToolsStatus("Wyłączono poziom testowy.");
  });
}
if (devTestConfettiBtn) {
  devTestConfettiBtn.addEventListener("click", runTestConfetti);
}
if (devSyncPullBtn) {
  devSyncPullBtn.addEventListener("click", () => {
    devSyncPull();
  });
}
if (devSyncPushBtn) {
  devSyncPushBtn.addEventListener("click", () => {
    devSyncPush();
  });
}
if (devRemoteRefreshBtn) {
  devRemoteRefreshBtn.addEventListener("click", () => {
    devRefreshRemote();
  });
}
if (devClearEntriesBtn) {
  devClearEntriesBtn.addEventListener("click", devClearEntries);
}
if (devClearCalendarBtn) {
  devClearCalendarBtn.addEventListener("click", devClearCalendar);
}
if (devClearPlannerBtn) {
  devClearPlannerBtn.addEventListener("click", devClearPlanner);
}
if (devResetLocalBtn) {
  devResetLocalBtn.addEventListener("click", devResetLocalData);
}
if (devSwUpdateBtn) {
  devSwUpdateBtn.addEventListener("click", () => {
    devUpdateSw();
  });
}
if (devSwUnregisterBtn) {
  devSwUnregisterBtn.addEventListener("click", () => {
    devUnregisterSw();
  });
}
if (devClearCachesBtn) {
  devClearCachesBtn.addEventListener("click", () => {
    devClearCaches();
  });
}
if (devReloadBtn) {
  devReloadBtn.addEventListener("click", devReload);
}
if (devUiRefreshBtn) {
  devUiRefreshBtn.addEventListener("click", devUiRefresh);
}
if (devStorageSummaryBtn) {
  devStorageSummaryBtn.addEventListener("click", devStorageSummary);
}
if (devCopyDebugBtn) {
  devCopyDebugBtn.addEventListener("click", () => {
    devCopyDebug();
  });
}
if (devExportDataBtn) {
  devExportDataBtn.addEventListener("click", devExportData);
}
if (devImportDataBtn && devImportFileInput) {
  devImportDataBtn.addEventListener("click", () => {
    devImportFileInput.click();
  });
}
if (devImportFileInput) {
  devImportFileInput.addEventListener("change", () => {
    const file = devImportFileInput.files?.[0];
    devImportDataFromFile(file);
    devImportFileInput.value = "";
  });
}
if (devToggleOutlinesBtn) {
  devToggleOutlinesBtn.addEventListener("click", devToggleOutlines);
}
if (devToggleNoAnimBtn) {
  devToggleNoAnimBtn.addEventListener("click", devToggleNoAnim);
}

const confirmDialog = document.getElementById("confirmDialog");
const confirmDialogTitle = document.getElementById("confirmDialogTitle");
const confirmDialogMessage = document.getElementById("confirmDialogMessage");
const confirmDialogCloseBtn = document.getElementById("confirmDialogCloseBtn");
const confirmDialogCancelBtn = document.getElementById("confirmDialogCancelBtn");
const confirmDialogOkBtn = document.getElementById("confirmDialogOkBtn");

let confirmResolver = null;

const showConfirmDialog = (message, title = "Potwierdzenie") =>
  new Promise((resolve) => {
    if (!confirmDialog || !confirmDialogMessage || !confirmDialogTitle) {
      resolve(false);
      return;
    }
    confirmDialogTitle.textContent = title;
    confirmDialogMessage.textContent = message;
    confirmDialog.hidden = false;
    confirmResolver = resolve;
  });

const closeConfirmDialog = (result) => {
  if (confirmDialog) confirmDialog.hidden = true;
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
};

if (confirmDialogCloseBtn) {
  confirmDialogCloseBtn.addEventListener("click", () => closeConfirmDialog(false));
}
if (confirmDialogCancelBtn) {
  confirmDialogCancelBtn.addEventListener("click", () => closeConfirmDialog(false));
}
if (confirmDialogOkBtn) {
  confirmDialogOkBtn.addEventListener("click", () => closeConfirmDialog(true));
}

const loadEntriesSafe = () => {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveEntriesSafe = (entries) => {
  storage.setItem(storageKey, JSON.stringify(entries));
};

const calendarEventsKey = "calendar.events.v1";

const loadCalendarEvents = () => {
  const raw = storage.getItem(calendarEventsKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveCalendarEvents = (events) => {
  storage.setItem(calendarEventsKey, JSON.stringify(events));
};

const computeHours = (start, end) => {
  const [sh, sm] = String(start || "").split(":").map(Number);
  const [eh, em] = String(end || "").split(":").map(Number);
  if (
    !Number.isFinite(sh) ||
    !Number.isFinite(sm) ||
    !Number.isFinite(eh) ||
    !Number.isFinite(em)
  ) {
    return null;
  }
  if (sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59) {
    return null;
  }
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return null;
  return (endMinutes - startMinutes) / 60;
};

const formatHours = (hours) => `${hours.toFixed(1)}h`;

const weekdayShort = ["Nd", "Pn", "Wt", "ďż˝r", "Czw", "Pt", "Sob"];

const isWorkEntry = (entry) => !entry?.kind || entry.kind === "work";

const eventTypeLabels = {
  vacation: "Urlop",
  off: "Wolne",
  l4: "L4",
  absent: "Nieobecność",
};

const formatEventLabel = (type) => eventTypeLabels[type] || "Zdarzenie";

const monthNames = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

const formatMonthLabel = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return "";
  const [year, month] = dateStr.split("-");
  const monthIndex = Number(month) - 1;
  const name = monthNames[monthIndex] || "";
  return name && year ? `${name} ${year}` : dateStr;
};

const loadRecentEntries = () => {
  const workEntries = loadEntriesSafe()
    .filter((entry) => entry && typeof entry.date === "string")
    .map((entry) => ({ ...entry, kind: entry.kind || "work" }));

  const seenEvents = new Set();
  const eventEntries = loadCalendarEvents()
    .filter((entry) => entry && typeof entry.date === "string")
    .filter((entry) => {
      const key = `${entry.date}:${entry.type || "event"}`;
      if (seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    })
    .map((entry) => ({
      id: `event:${entry.date}:${entry.type || "event"}`,
      kind: "event",
      date: entry.date,
      type: entry.type || "event",
    }));

  return [...workEntries, ...eventEntries].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    if (a.kind === b.kind) return 0;
    return a.kind === "event" ? 1 : -1;
  });
};

const entriesPageSize = 4;
let entriesVisibleCount = entriesPageSize;
let entriesExpanded = false;

const updateEntriesShowMore = (totalCount) => {
  if (!entriesShowMoreBtn) return;
  if (totalCount <= entriesPageSize) {
    entriesShowMoreBtn.hidden = true;
    entriesVisibleCount = entriesPageSize;
    entriesExpanded = false;
    return;
  }
  entriesShowMoreBtn.hidden = false;
  entriesShowMoreBtn.textContent = entriesExpanded ? "Pokaż mniej" : "Pokaż więcej";
};

const renderEntries = () => {
  if (!entriesList) return;
  const entries = loadRecentEntries();
  entriesList.innerHTML = "";
  if (entries.length <= entriesPageSize) {
    entriesVisibleCount = entriesPageSize;
    entriesExpanded = false;
  } else {
    entriesVisibleCount = entriesExpanded ? Number.POSITIVE_INFINITY : entriesPageSize;
  }

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entries-v3-empty";
    empty.textContent = "Brak wpisów.";
    entriesList.appendChild(empty);
  } else {
    let lastMonthKey = "";
    entries
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, entriesVisibleCount)
      .forEach((entry) => {
        const monthKey = String(entry.date || "").slice(0, 7);
        if (monthKey && monthKey !== lastMonthKey) {
          lastMonthKey = monthKey;
          const header = document.createElement("li");
          header.className = "entries-v3-month";
          header.textContent = formatMonthLabel(entry.date);
          entriesList.appendChild(header);
        }
        const li = document.createElement("li");
        li.className = "entries-v3-item";

        const main = document.createElement("div");
        main.className = "entries-v3-main";

        const top = document.createElement("div");
        top.className = "entries-v3-top";

        const dateLabel = document.createElement("span");
        dateLabel.className = "entries-v3-date";
        dateLabel.textContent = entry.date;

        const dayLabel = document.createElement("span");
        dayLabel.className = "entries-v3-day";
        const dateObj = new Date(entry.date);
        dayLabel.textContent = weekdayShort[dateObj.getDay()] || "";

        top.appendChild(dateLabel);
        top.appendChild(dayLabel);

        const isEvent = entry.kind === "event";
        if (isEvent) {
          li.classList.add("entries-v3-item--event");
          if (entry.type) li.classList.add(`entries-v3-item--${entry.type}`);
        }

        const time = document.createElement("div");
        time.className = "entries-v3-time";
        time.textContent = isEvent
          ? formatEventLabel(entry.type)
          : `${entry.start}-${entry.end}`;

        main.appendChild(top);
        main.appendChild(time);

        const side = document.createElement("div");
        side.className = "entries-v3-side";

        const hours = document.createElement("div");
        hours.className = "entries-v3-hours";
        hours.textContent = isEvent ? "—" : formatHours(entry.hours);

        const remove = document.createElement("button");
        remove.className = "entries-v3-remove";
        remove.type = "button";
        remove.textContent = "Usuń";
        remove.addEventListener("click", async () => {
          const ok = await showConfirmDialog(
            isEvent ? "Usunąć to zdarzenie?" : "Usunąć ten wpis?",
            isEvent ? "Usuń zdarzenie" : "Usuń wpis"
          );
          if (!ok) return;
          if (isEvent) {
            const next = loadCalendarEvents().filter(
              (item) => !(item.date === entry.date && item.type === entry.type)
            );
            saveCalendarEvents(next);
            refreshAll();
          } else {
            const next = loadEntriesSafe().filter((item) => item.id !== entry.id);
            saveEntriesSafe(next);
            refreshAll();
          }
        });

        side.appendChild(hours);
        side.appendChild(remove);

        li.appendChild(main);
        li.appendChild(side);
        entriesList.appendChild(li);
      });
  }
  updateEntriesShowMore(entries.length);
};

const computeStats = () => {
  const entries = loadEntriesSafe().filter(isWorkEntry);
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const todayHours = entries
    .filter((e) => e.date === today)
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const monthHours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  const datesSet = new Set(entries.map((e) => e.date));
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!datesSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  if (todayHoursEl) todayHoursEl.textContent = `${todayHours.toFixed(1)} h`;
  if (monthHoursEl) monthHoursEl.textContent = `${monthHours.toFixed(1)} h`;
  if (streakDaysEl) streakDaysEl.textContent = `${streak} dni`;
};

const updateEarningsForecast = () => {
  if (!forecastMonthGross || !forecastMonthNet || !forecastMonthLabel) return;
  const rate = getRate();
  const netFactor = getNetFactor();
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  const entries = loadEntriesSafe().filter(isWorkEntry);
  const monthHours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  const gross = monthHours * rate;
  const net = gross * netFactor;

  forecastMonthGross.textContent = formatPLN(gross);
  forecastMonthNet.textContent = formatPLN(net);
  const monthName = now.toLocaleString("pl-PL", { month: "long" });
  forecastMonthLabel.textContent = `${monthName} ${year}`;
  if (forecastRateHint) {
    const suffix = earningsConfig?.rateLabelSuffix || "PLN/h brutto";
    forecastRateHint.textContent = `Stawka: ${rate.toFixed(2)} ${suffix}`;
  }
};

const showRankToast = (rankName, level) => {
  if (!rankUpToast) return;
  if (rankToastTitle) rankToastTitle.textContent = "Nowa ranga";
  if (rankToastSubtitle) rankToastSubtitle.textContent = rankName;
  const rankToastMeta = document.getElementById("rankToastMeta");
  if (rankToastMeta) {
    rankToastMeta.textContent = Number.isFinite(level) ? `Poziom ${level}` : "Nowy poziom";
  }
  const duration = 4200;
  rankUpToast.style.setProperty("--toast-duration", `${duration}ms`);
  const bar = rankUpToast.querySelector(".rank-toast__bar span");
  if (bar) {
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
  }
  rankUpToast.hidden = false;
  window.clearTimeout(showRankToast._timer);
  showRankToast._timer = window.setTimeout(() => {
    if (rankUpToast) rankUpToast.hidden = true;
  }, duration);
};

const fireConfetti = () => {
  if (!rankConfetti) return;
  rankConfetti.innerHTML = "";
  const colors = ["#ffffff", "#5cffa4", "#e7c368", "#8cd4e6", "#b86cff", "#ff7a7a"];
  const pieces = 24;
  for (let i = 0; i < pieces; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const x = (Math.random() - 0.5) * 320;
    const rot = Math.random() * 360;
    const duration = 1.6 + Math.random() * 1.4;
    const size = 6 + Math.random() * 6;
    piece.style.setProperty("--confetti-x", `${x}px`);
    piece.style.setProperty("--confetti-rot", `${rot}deg`);
    piece.style.setProperty("--confetti-duration", `${duration}s`);
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.6}px`;
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${45 + Math.random() * 10}%`;
    rankConfetti.appendChild(piece);
  }
  window.clearTimeout(fireConfetti._timer);
  fireConfetti._timer = window.setTimeout(() => {
    if (rankConfetti) rankConfetti.innerHTML = "";
  }, 2600);
};

const renderLeaderboard = async () => {
  if (!leaderboardList || !leaderboardEmpty) return;
  const remoteItems = Array.isArray(supabaseCommunityUsers) ? supabaseCommunityUsers : [];
  const merged = remoteItems;
  if (leaderboardMeta) {
    leaderboardMeta.textContent = "Supabase";
  }
  const enriched = merged.map((user) => {
    const entries = Array.isArray(user?.entries) ? user.entries : [];
    const totalExp = computeTotalExpForEntries(entries);
    const { level } = computeLevelingFromExp(totalExp);
    const { rankName: computedRankName } = getRankInfo(level);
    return {
      id: user?.id || user?.user_id || "",
      name: user?.name || "Anonim",
      rankName: user?.rankName || computedRankName,
      totalExp,
    };
  });
  const sorted = enriched
    .filter((item) => item && typeof item.totalExp === "number")
    .sort((a, b) => b.totalExp - a.totalExp)
    .slice(0, 5);

  leaderboardList.innerHTML = "";
  if (!sorted.length) {
    leaderboardEmpty.hidden = false;
    return;
  }
  leaderboardEmpty.hidden = true;
  sorted.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "leaderboard-item";
    const rankLabel = document.createElement("span");
    rankLabel.className = "leaderboard-rank";
    rankLabel.textContent = String(index + 1);
    const meta = document.createElement("div");
    meta.className = "leaderboard-meta";
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = item.name || "Anonim";
    const rankName = document.createElement("span");
    rankName.className = "leaderboard-rankname";
    rankName.textContent = item.rankName || "—";
    meta.appendChild(name);
    meta.appendChild(rankName);
    const exp = document.createElement("span");
    exp.className = "leaderboard-exp";
    exp.textContent = `${Math.round(item.totalExp)} EXP`;
    li.appendChild(rankLabel);
    li.appendChild(meta);
    li.appendChild(exp);
    leaderboardList.appendChild(li);
  });
};

const startOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatDateKeyLocal = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const getWeekKey = (date) => {
  const start = startOfWeek(date);
  return `week-${formatDateKeyLocal(start)}`;
};

const loadWeeklyChallenges = (weekKey) => {
  const raw = storage.getItem(weeklyChallengesKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.weekKey !== weekKey) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveWeeklyChallenges = (payload) => {
  storage.setItem(weeklyChallengesKey, JSON.stringify(payload));
};

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pickWeeklyChallenges = (weekKey, catalog, count = 3) => {
  const pool = Array.isArray(catalog?.challenges)
    ? catalog.challenges.filter((item) => item && item.id && item.type && item.target)
    : [];

  if (!pool.length) return null;

  const rng = mulberry32(hashString(weekKey));
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
};

const buildWeeklyChallenges = (weekKey, catalog) => {
  const fallback = [
    { id: "hours-20", type: "hours", target: 20, title: "20 godzin pracy w tym tygodniu" },
    { id: "days-4", type: "days", target: 4, title: "4 dni pracy w tym tygodniu" },
    { id: "streak-3", type: "streak", target: 3, title: "3 dni z rzędu w tym tygodniu" },
  ];
  const challenges = pickWeeklyChallenges(weekKey, catalog) || fallback;
  const payload = { weekKey, challenges };
  saveWeeklyChallenges(payload);
  return payload;
};

const getWeeklyWorkStats = (weekKey) => {
  const entries = getEntriesSafe();
  const weekStartStr = weekKey.replace("week-", "");
  const weekStart = new Date(`${weekStartStr}T00:00:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const workEntries = entries.filter((e) => e && e.kind === "work" && typeof e.date === "string");
  const byDate = new Map();
  workEntries.forEach((e) => {
    const dateObj = new Date(`${e.date}T00:00:00`);
    if (dateObj < weekStart || dateObj > weekEnd) return;
    const hours = Number(e.hours) || 0;
    byDate.set(e.date, (byDate.get(e.date) || 0) + hours);
  });

  const dates = Array.from(byDate.keys()).sort();
  const totalHours = dates.reduce((sum, date) => sum + (byDate.get(date) || 0), 0);
  const daysWorked = dates.length;

  let maxStreak = 0;
  let currentStreak = 0;
  let prev = null;
  dates.forEach((dateStr) => {
    const dateObj = new Date(`${dateStr}T00:00:00`);
    if (prev) {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      if (next.toISOString().slice(0, 10) === dateStr) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    prev = dateObj;
  });

  return { totalHours, daysWorked, maxStreak };
};

const renderWeeklyChallenges = async () => {
  if (!weeklyChallengesList || !weeklyChallengesEmpty) return;
  const weekKey = getWeekKey(new Date());
  if (weeklyChallengesMeta) {
    weeklyChallengesMeta.textContent = `Tydzień: ${weekKey.replace("week-", "")}`;
  }
  const catalog = await fetchWeeklyChallengesCatalog();
  const data = loadWeeklyChallenges(weekKey);
  const payload = data || buildWeeklyChallenges(weekKey, catalog);

  const stats = getWeeklyWorkStats(weekKey);
  weeklyChallengesList.innerHTML = "";
  if (!payload?.challenges?.length) {
    weeklyChallengesEmpty.hidden = false;
    return;
  }
  weeklyChallengesEmpty.hidden = true;

  payload.challenges.forEach((challenge) => {
    let value = 0;
    let suffix = "";
    if (challenge.type === "hours") {
      value = stats.totalHours;
      suffix = "h";
    } else if (challenge.type === "days") {
      value = stats.daysWorked;
      suffix = "dni";
    } else if (challenge.type === "streak") {
      value = stats.maxStreak;
      suffix = "dni";
    }
    const progress = Math.min(100, Math.round((value / challenge.target) * 100));
    const isComplete = value >= challenge.target;

    const li = document.createElement("li");
    li.className = `weekly-challenge-item${isComplete ? " is-complete" : ""}`;
    const top = document.createElement("div");
    top.className = "weekly-challenge-top";
    const title = document.createElement("span");
    title.className = "weekly-challenge-title";
    title.textContent = challenge.title;
    const meta = document.createElement("span");
    meta.className = "weekly-challenge-meta";
    meta.textContent = `${Math.round(value)}/${challenge.target} ${suffix}`;
    const track = document.createElement("div");
    track.className = "weekly-challenge-track";
    const fill = document.createElement("div");
    fill.className = "weekly-challenge-fill";
    fill.style.width = `${progress}%`;

    top.appendChild(title);
    top.appendChild(meta);
    track.appendChild(fill);
    li.appendChild(top);
    li.appendChild(track);
    weeklyChallengesList.appendChild(li);
  });
};

const getProfileJoinDate = () => {
  const raw = storage.getItem(joinDateKey);
  if (raw) return raw;
  const today = new Date().toISOString().slice(0, 10);
  storage.setItem(joinDateKey, today);
  return today;
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("pl-PL");
};


const buildEventMap = (events) => {
  const map = new Map();
  events.forEach((event) => {
    if (!event || typeof event.date !== "string") return;
    map.set(event.date, event.type || "event");
  });
  return map;
};

const getStatusForDate = (entries, events, dateStr) => {
  const eventMap = buildEventMap(events);
  const eventType = eventMap.get(dateStr);
  if (eventType) {
    return { label: formatEventLabel(eventType), type: eventType, hasData: true };
  }
  const hasWork = entries.some((e) => isWorkEntry(e) && e.date === dateStr);
  if (hasWork) return { label: "Praca", type: "work", hasData: true };
  return { label: "Brak wpisu", type: null, hasData: false };
};

const getLiveWorkStatus = (entries, dateStr, now = new Date()) => {
  if (!dateStr) return { label: "Brak wpisu", type: "off" };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayEntries = entries.filter((e) => isWorkEntry(e) && e.date === dateStr);
  for (const entry of todayEntries) {
    if (!entry.start || !entry.end) continue;
    const [sh, sm] = String(entry.start).split(":").map(Number);
    const [eh, em] = String(entry.end).split(":").map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
      continue;
    }
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (nowMinutes >= startMin && nowMinutes <= endMin) {
      return { label: "W pracy", type: "work" };
    }
  }
  if (todayEntries.length) return { label: "Po pracy", type: "off" };
  return { label: "Brak wpisu", type: "off" };
};

const renderCommunityCalendar = (user) => {
  if (!communityCalendarGrid || !communityCalendarLabel || !user) return;
  const base = new Date();
  base.setMonth(base.getMonth() + communityCalendarOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();

  const label = base.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  communityCalendarLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const firstDay = new Date(year, month, 1);
  const startIndex = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const entries = Array.isArray(user.entries) ? user.entries : [];
  const events = Array.isArray(user.events) ? user.events : [];

  communityCalendarGrid.innerHTML = "";
  for (let i = 0; i < startIndex; i += 1) {
    const empty = document.createElement("div");
    empty.className = "community-day is-empty";
    communityCalendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const status = getStatusForDate(entries, events, dateStr);
    const cell = document.createElement("div");
    cell.className = "community-day";
    const number = document.createElement("span");
    number.textContent = String(day);
    cell.appendChild(number);
    if (status.hasData) {
      const dot = document.createElement("i");
      dot.className = `cal-dot cal-dot--${status.type || "off"}`;
      cell.appendChild(dot);
    }
    communityCalendarGrid.appendChild(cell);
  }
};

const buildCommunityDaySummary = (users, dateStr) => {
  const summary = {
    work: 0,
    vacation: 0,
    l4: 0,
    absent: 0,
    off: 0,
  };
  users.forEach((user) => {
    const entries = Array.isArray(user.entries) ? user.entries : [];
    const events = Array.isArray(user.events) ? user.events : [];
    const status = getStatusForDate(entries, events, dateStr);
    if (!status?.hasData) return;
    const type = status.type || "off";
    summary[type] = (summary[type] || 0) + 1;
  });
  return summary;
};

const renderCommunityDayList = (users, dateStr) => {
  if (!communityDayList || !communityDayEmpty) return;
  communityDayList.innerHTML = "";
  if (communityDayLabel) {
    communityDayLabel.textContent = dateStr ? formatDateShort(dateStr) : "-";
  }
  if (!dateStr) {
    communityDayEmpty.hidden = false;
    return;
  }
  users.forEach((user) => {
    const entries = Array.isArray(user.entries) ? user.entries : [];
    const events = Array.isArray(user.events) ? user.events : [];
    const status = getStatusForDate(entries, events, dateStr);
    const li = document.createElement("li");
    li.className = "community-item community-item--static";
    const avatar = document.createElement("div");
    avatar.className = "community-avatar";
    if (user.avatarUrl) {
      const img = document.createElement("img");
      img.src = user.avatarUrl;
      img.alt = user.name || "Avatar";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (user.name || "U")[0]?.toUpperCase() || "U";
    }
    const info = document.createElement("div");
    info.className = "community-info";
    const name = document.createElement("span");
    name.className = "community-name";
    name.textContent = user.name || "Użytkownik";
    const sub = document.createElement("span");
    sub.className = "community-sub";
    if (status.hasData) {
      const dot = document.createElement("i");
      dot.className = `cal-dot cal-dot--${status.type || "off"}`;
      sub.appendChild(dot);
    }
    sub.append(` Status: ${status.label}`);
    info.appendChild(name);
    info.appendChild(sub);
    li.appendChild(avatar);
    li.appendChild(info);
    communityDayList.appendChild(li);
  });
  communityDayEmpty.hidden = users.length > 0;
};

const renderCommunityOverview = () => {
  if (!communityOverviewGrid || !communityOverviewLabel) return;
  const users = getCommunityUsers();
  const base = new Date();
  base.setMonth(base.getMonth() + communityOverviewOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const label = base.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  communityOverviewLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const firstDay = new Date(year, month, 1);
  const startIndex = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  if (!communitySelectedDate || !communitySelectedDate.startsWith(monthKey)) {
    const today = new Date();
    const day = today.getMonth() === month && today.getFullYear() === year ? today.getDate() : 1;
    communitySelectedDate = `${monthKey}-${String(day).padStart(2, "0")}`;
  }

  communityOverviewGrid.innerHTML = "";
  for (let i = 0; i < startIndex; i += 1) {
    const empty = document.createElement("div");
    empty.className = "community-day is-empty";
    communityOverviewGrid.appendChild(empty);
  }

  const statusTypes = ["work", "vacation", "l4", "absent", "off"];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    const summary = buildCommunityDaySummary(users, dateStr);
    const hasAny = Object.values(summary).some((value) => value > 0);
    const cell = document.createElement("div");
    cell.className = "community-day community-day--clickable";
    if (dateStr === communitySelectedDate) cell.classList.add("is-selected");
    const number = document.createElement("span");
    number.textContent = String(day);
    const dots = document.createElement("div");
    dots.className = "community-day__dots";
    if (hasAny) {
      statusTypes.forEach((type) => {
        const dot = document.createElement("i");
        dot.className = `cal-dot cal-dot--${type}`;
        if (summary[type] > 0) {
          dot.classList.add("is-active");
        }
        dots.appendChild(dot);
      });
    }
    cell.appendChild(number);
    cell.appendChild(dots);
    cell.addEventListener("click", () => {
      communitySelectedDate = dateStr;
      renderCommunityOverview();
    });
    communityOverviewGrid.appendChild(cell);
  }

  renderCommunityDayList(users, communitySelectedDate);
};

const loadCommunityUsers = () => {
  const raw = storage.getItem(communityKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCommunityUsers = (items) => {
  storage.setItem(communityKey, JSON.stringify(items));
};

const purgeCommunityDemoData = () => {
  const existing = loadCommunityUsers();
  if (!existing.length) return;
  const demoNames = new Set([
    "Marta K.",
    "Kamil R.",
    "Ola P.",
    "Bartek S.",
    "Iga W.",
    "Tomek L.",
    "Ania G.",
  ]);
  const filtered = existing.filter((user) => {
    if (!user?.id) return false;
    if (String(user.id).startsWith("mock-")) return false;
    if (user.name && demoNames.has(String(user.name).trim())) return false;
    return true;
  });
  if (filtered.length !== existing.length) {
    saveCommunityUsers(filtered);
  }
};

const upsertCurrentUserToCommunity = () => {
  const deviceId = getDeviceId();
  if (supabaseEnabled && supabaseClient && supabaseUser?.id) {
    const payload = buildCommunityPayload();
    if (!payload.user_id) return;
    supabaseClient
      .from(supabaseCommunityTable)
      .upsert(payload, { onConflict: "user_id" })
      .then(({ error }) => {
        if (error) setSupabaseStatus("Błąd zapisu społeczności.", true);
      });
    return;
  }

  const currentEntries = getEntriesSafe();
  const currentEvents = loadCalendarEvents();
  const currentJoin = getProfileJoinDate();
  const currentProfile = loadProfile();
  const currentAvatarUrl = currentProfile.avatarUrl || "";
  const totalExp = computeTotalExpForEntries(currentEntries);
  const { level, progress } = computeLevelingFromExp(totalExp);
  const { rankName } = getRankInfo(level);
  const achievements = loadAchievements().filter((item) => item.unlocked).length;
  const today = new Date().toISOString().slice(0, 10);
  const status = getStatusForDate(currentEntries, currentEvents, today);
  const liveStatus = getLiveWorkStatus(currentEntries, today);

  const entry = {
    id: deviceId,
    name: currentProfile.name || "Gość",
    avatarUrl: currentAvatarUrl,
    joinedAt: currentJoin,
    totalHours: currentEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0),
    level,
    levelProgress: progress,
    rankName,
    achievements,
    status,
    liveStatus,
    entries: currentEntries,
    events: currentEvents,
    updatedAt: Date.now(),
  };

  const items = loadCommunityUsers().filter((user) => user?.id && user.id !== deviceId);
  items.unshift(entry);
  saveCommunityUsers(items);
};

const buildMockCommunityUsers = () => {
  const today = new Date();
  const mkDate = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const makeEntries = (baseHours) =>
    Array.from({ length: 10 }).map((_, i) => ({
      id: `mock-${Date.now()}-${i}`,
      kind: "work",
      date: mkDate(i),
      hours: Math.max(4, baseHours - i % 3),
    }));

  const users = (communityConfig.mockUsers || []).map((user, index) => {
    const baseHours = Number(user.entriesBaseHours || 6);
    const joinedOffset = Number(user.joinedOffsetDays || 30);
    const events = Array.isArray(user.events) ? user.events : [];
    return {
      id: user.id || `mock-${index + 1}`,
      name: user.name || "Użytkownik",
      avatarUrl: user.avatarUrl || "",
      joinedAt: mkDate(joinedOffset),
      entries: makeEntries(baseHours),
      events: events.map((event) => ({
        date: mkDate(Number(event.offsetDays || 0)),
        type: event.type || "off",
      })),
      achievements: Number(user.achievements || 0),
    };
  });

  return users;
};

const getLocalCommunityUsers = () => {
  const currentEntries = getEntriesSafe();
  const currentEvents = loadCalendarEvents();
  const currentJoin = getProfileJoinDate();
  const currentProfile = loadProfile();
  const currentAvatarUrl = currentProfile.avatarUrl || "";
  const totalExp = computeTotalExpForEntries(currentEntries);
  const { level, progress } = computeLevelingFromExp(totalExp);
  const { rankName } = getRankInfo(level);
  const achievements = loadAchievements().filter((item) => item.unlocked).length;
  const today = new Date().toISOString().slice(0, 10);
  const status = getStatusForDate(currentEntries, currentEvents, today);
  const liveStatus = getLiveWorkStatus(currentEntries, today);

  const currentUser = {
    id: getDeviceId(),
    name: currentProfile.name || "Gość",
    avatarUrl: currentAvatarUrl,
    joinedAt: currentJoin,
    totalHours: currentEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0),
    level,
    levelProgress: progress,
    rankName,
    achievements,
    status,
    liveStatus,
    entries: currentEntries,
    events: currentEvents,
  };

  let others = loadCommunityUsers().filter((user) => user?.id !== getDeviceId());
  if (!others.length && communityConfig.useMock) {
    others = buildMockCommunityUsers();
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const normalizedOthers = others.map((user) => {
    const entries = Array.isArray(user.entries) ? user.entries : [];
    const events = Array.isArray(user.events) ? user.events : [];
    const exp = computeTotalExpForEntries(entries);
    const { level: otherLevel, progress: otherProgress } = computeLevelingFromExp(exp);
    const otherBand =
      rankBands.find((b) => otherLevel >= b.min && otherLevel <= b.max) || rankBands[rankBands.length - 1];
    const { rankName: otherRankName } = getRankInfo(otherLevel);
    const status = getStatusForDate(entries, events, todayStr);
    const liveStatus = getLiveWorkStatus(entries, todayStr);
    return {
      ...user,
      level: otherLevel,
      rankName: otherRankName,
      totalHours: entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0),
      levelProgress: otherProgress,
      achievements: user.achievements || Math.floor(3 + Math.random() * 8),
      status,
      liveStatus,
      entries,
      events,
    };
  });
  return [currentUser, ...normalizedOthers];
};

const getCommunityUsers = () => {
  if (supabaseEnabled && supabaseUser && Array.isArray(supabaseCommunityUsers)) {
    return supabaseCommunityUsers;
  }
  return getLocalCommunityUsers();
};

const openCommunityProfile = (user) => {
  if (!communityProfileModal) return;
  currentCommunityUser = user;
  communityCalendarOffset = 0;
  if (communityProfileAvatar) setAvatar(communityProfileAvatar, user.avatarUrl, user.name);
  if (communityProfileName) communityProfileName.textContent = user.name || "Użytkownik";
  if (communityProfileRankText) communityProfileRankText.textContent = user.rankName || "—";
  if (communityProfileProgressBar) {
    const progressValue = Math.round((user.levelProgress || 0) * 100);
    communityProfileProgressBar.style.width = `${progressValue}%`;
  }
  if (communityProfileLevelText) communityProfileLevelText.textContent = `Poziom ${user.level || 1}`;
  if (communityProfileHours) communityProfileHours.textContent = `${Math.round(user.totalHours || 0)} h`;
  if (communityProfileAchievements) communityProfileAchievements.textContent = String(user.achievements || 0);
  if (communityProfileJoined) communityProfileJoined.textContent = formatDateShort(user.joinedAt);

  renderCommunityCalendar(user);
  communityProfileModal.hidden = false;
};

const renderCommunityList = () => {
  if (!communityList || !communityEmpty) return;
  const users = getCommunityUsers();
  communityList.innerHTML = "";
  if (!users.length) {
    communityEmpty.hidden = false;
    return;
  }
  communityEmpty.hidden = true;
  if (communityMeta) {
    communityMeta.textContent = supabaseEnabled && supabaseUser ? "Supabase" : "Lokalnie";
  }

  users.forEach((user) => {
    const li = document.createElement("li");
    li.className = "community-item";
    const avatar = document.createElement("div");
    avatar.className = "community-avatar";
    if (user.avatarUrl) {
      const img = document.createElement("img");
      img.src = user.avatarUrl;
      img.alt = user.name || "Avatar";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (user.name || "U")[0]?.toUpperCase() || "U";
    }
    const info = document.createElement("div");
    info.className = "community-info";
    const name = document.createElement("span");
    name.className = "community-name";
    name.textContent = user.name || "Użytkownik";
    const sub = document.createElement("span");
    sub.className = "community-sub";
    const live = user.liveStatus || user.status || { label: "Brak wpisu" };
    sub.textContent = `${user.rankName || "—"} • ${Math.round(user.totalHours || 0)} h • ${live.label}`;
    info.appendChild(name);
    info.appendChild(sub);
    li.appendChild(avatar);
    li.appendChild(info);
    li.addEventListener("click", () => openCommunityProfile(user));
    communityList.appendChild(li);
  });
};

const refreshAll = () => {
  updateAchievementsFromStats();
  upsertCurrentUserToCommunity();
  refreshCommunityFromSupabase();
  renderEntries();
  computeStats();
  updateEarningsForecast();
  computeEarnings();
  renderSelectedMonthEarnings();
  updateRankUI();
  renderWeekBars();
  renderAchievements();
  renderProductionList();
  if (typeof window.renderCalendar === "function") {
    window.renderCalendar();
  }
  renderLeaderboard();
  renderWeeklyChallenges();
  renderCommunityOverview();
  renderCommunityList();
};

const cleanupStrayTextNodes = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const toRemove = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent || "";
    if (!text.trim()) continue;
    if (/\\[rn]/.test(text) && text.trim().length <= 12) {
      toRemove.push(node);
    }
  }
  toRemove.forEach((node) => node.parentNode?.removeChild(node));
};

const syncWorkDateDisplay = () => {
  if (workDate && workDateDisplayInput) {
    workDateDisplayInput.value = workDate.value || "";
  }
};

if (workDate) {
  workDate.addEventListener("change", syncWorkDateDisplay);
}

if (workForm && workDate && startTimeInput && endTimeInput) {
  const today = new Date().toISOString().slice(0, 10);
  workDate.value = today;
  syncWorkDateDisplay();

  workForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = workDate.value;
    const start = startTimeInput.value;
    const end = endTimeInput.value;
    if (!date || !start || !end) {
      if (workFormStatus) {
        workFormStatus.textContent = "Uzupelnij date oraz godziny start i koniec.";
      }
      return;
    }

    const hours = computeHours(start, end);
    if (hours === null) {
      if (workFormStatus) {
        workFormStatus.textContent = "Godzina konca musi byc pozniej niz start.";
      }
      return;
    }

    const entries = loadEntriesSafe();
    entries.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: "work",
      date,
      start,
      end,
      hours,
    });
    saveEntriesSafe(entries);
    startTimeInput.value = "";
    endTimeInput.value = "";
    if (workFormStatus) workFormStatus.textContent = "Zapisano wpis.";
    refreshAll();
  });

  if (workFormSubmitBtn) {
    workFormSubmitBtn.addEventListener("click", () => {
      if (workFormStatus) workFormStatus.textContent = "";
    });
  }
}

if (clearAllBtn) {
  clearAllBtn.addEventListener("click", () => {
    if (!confirm("Usunďż˝ďż˝ wszystkie wpisy?")) return;
    saveEntriesSafe([]);
    refreshAll();
  });
}
if (entriesShowMoreBtn) {
  entriesShowMoreBtn.addEventListener("click", () => {
    entriesExpanded = !entriesExpanded;
    renderEntries();
  });
}

const setActiveViewInternal = (viewKey) => {
  const isAuthView = String(viewKey).toLowerCase() === "auth";
  if (!isAuthView) {
    lastNonAuthView = viewKey;
  }
  document.body.classList.toggle("auth-mode", isAuthView);
  viewSections.forEach((section) => {
    section.classList.toggle(
      "is-active",
      section.id.toLowerCase() === `view${viewKey}`.toLowerCase()
    );
  });
  navItems.forEach((item) => {
    item.classList.toggle("nav-item--active", item.dataset.view === viewKey);
  });
};

const openAdminAuth = () => {
  if (!adminAuthModal) return;
  if (adminAuthError) adminAuthError.hidden = true;
  if (adminAuthInput) adminAuthInput.value = "";
  adminAuthModal.hidden = false;
  adminAuthInput?.focus();
};

const closeAdminAuth = () => {
  if (!adminAuthModal) return;
  adminAuthModal.hidden = true;
};

const tryUnlockAdmin = () => {
  const value = adminAuthInput?.value || "";
  if (value === adminPassword) {
    isAdminUnlocked = true;
    sessionStorage.setItem(adminUnlockKey, "true");
    closeAdminAuth();
    setActiveViewInternal("admin");
    return;
  }
  if (adminAuthError) adminAuthError.hidden = false;
};

const setActiveView = (viewKey) => {
  if (supabaseEnabled && !supabaseUser && String(viewKey).toLowerCase() !== "auth") {
    openSupabaseAuthView();
    return;
  }
  if (viewKey === "admin" && !isAdminUnlocked) {
    openAdminAuth();
    return;
  }
  setActiveViewInternal(viewKey);
};

if (adminAuthCloseBtn) {
  adminAuthCloseBtn.addEventListener("click", closeAdminAuth);
}
if (adminAuthCancelBtn) {
  adminAuthCancelBtn.addEventListener("click", closeAdminAuth);
}
if (adminAuthOkBtn) {
  adminAuthOkBtn.addEventListener("click", tryUnlockAdmin);
}

const closeCommunityProfile = () => {
  if (communityProfileModal) communityProfileModal.hidden = true;
};

if (communityProfileCloseBtn) {
  communityProfileCloseBtn.addEventListener("click", closeCommunityProfile);
}
if (communityProfileModal) {
  communityProfileModal.addEventListener("click", (event) => {
    if (event.target === communityProfileModal) closeCommunityProfile();
  });
}
if (communityCalendarPrevBtn) {
  communityCalendarPrevBtn.addEventListener("click", () => {
    if (!currentCommunityUser) return;
    communityCalendarOffset -= 1;
    renderCommunityCalendar(currentCommunityUser);
  });
}
if (communityCalendarNextBtn) {
  communityCalendarNextBtn.addEventListener("click", () => {
    if (!currentCommunityUser) return;
    communityCalendarOffset += 1;
    renderCommunityCalendar(currentCommunityUser);
  });
}
if (communityOverviewPrevBtn) {
  communityOverviewPrevBtn.addEventListener("click", () => {
    communityOverviewOffset -= 1;
    renderCommunityOverview();
  });
}
if (communityOverviewNextBtn) {
  communityOverviewNextBtn.addEventListener("click", () => {
    communityOverviewOffset += 1;
    renderCommunityOverview();
  });
}

const topAppBar = document.querySelector(".md3-top-app-bar--floating");
const topbarSpacer = document.querySelector(".topbar-spacer");
const isAndroid = /Android/i.test(navigator.userAgent || "");
let lastScrollY = window.scrollY;
let ticking = false;

const updateTopbarStatic = () => {
  if (!topAppBar) return;
  const currentY = window.scrollY;
  if (currentY <= 8) {
    topAppBar.classList.remove("is-elevated");
  } else {
    topAppBar.classList.add("is-elevated");
  }
  topAppBar.classList.remove("is-hidden");
  if (topbarSpacer) topbarSpacer.classList.remove("is-collapsed");
};

const updateTopbarOnScroll = () => {
  ticking = false;
  if (!topAppBar) return;

  const currentY = window.scrollY;
  const delta = currentY - lastScrollY;
  const goingDown = delta > 2;
  const goingUp = delta < -2;

  if (currentY <= 8) {
    topAppBar.classList.remove("is-hidden");
    topAppBar.classList.remove("is-elevated");
    if (topbarSpacer) topbarSpacer.classList.remove("is-collapsed");
  } else {
    topAppBar.classList.add("is-elevated");
    if (goingDown) {
      topAppBar.classList.add("is-hidden");
      if (topbarSpacer) topbarSpacer.classList.add("is-collapsed");
    } else if (goingUp) {
      topAppBar.classList.remove("is-hidden");
      if (topbarSpacer) topbarSpacer.classList.remove("is-collapsed");
    }
  }

  lastScrollY = currentY;
};

const onScroll = () => {
  if (!ticking) {
    window.requestAnimationFrame(updateTopbarOnScroll);
    ticking = true;
  }
};

if (topAppBar && topbarSpacer) {
  document.body.classList.add("topbar-float");
  if (isAndroid) {
    document.body.classList.add("android");
    updateTopbarStatic();
    window.addEventListener("resize", updateTopbarStatic);
  } else {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateTopbarOnScroll);
    updateTopbarOnScroll();
  }
}
if (adminAuthInput) {
  adminAuthInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      tryUnlockAdmin();
    }
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const viewKey = item.dataset.view;
    if (!viewKey) return;
    setActiveView(viewKey);
  });
});

if (navItems.length > 0 && viewSections.length > 0) {
  const active = navItems.find((item) =>
    item.classList.contains("nav-item--active")
  );
  if (active && active.dataset.view) {
    setActiveView(active.dataset.view);
  } else {
    setActiveView("main");
  }
}

const calendarEl = document.getElementById("monthCalendar");
const monthLabelEl = document.getElementById("calendarMonthLabel");
const prevBtn = document.getElementById("calendarPrevBtn");
const nextBtn = document.getElementById("calendarNextBtn");

if (calendarEl && monthLabelEl) {
  const monthNames = [
    "Styczen",
    "Luty",
    "Marzec",
    "Kwiecien",
    "Maj",
    "Czerwiec",
    "Lipiec",
    "Sierpien",
    "Wrzesien",
    "Pazdziernik",
    "Listopad",
    "Grudzien",
  ];

  const weekday = ["Pn", "Wt", "Sr", "Czw", "Pt", "Sob", "Nd"];

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  };

  const clearCalendar = () => {
    while (calendarEl.firstChild) {
      calendarEl.removeChild(calendarEl.firstChild);
    }
  };

  const renderHeader = () => {
    weekday.forEach((label) => {
      const head = document.createElement("div");
      head.className = "month-calendar__head";
      head.textContent = label;
      calendarEl.appendChild(head);
    });
  };

  const getEasterDate = (year) => {
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
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
  };

  const buildHolidaySet = (year) => {
    const pad = (num) => String(num).padStart(2, "0");
    const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
    const set = new Set();
    // Fixed public holidays (PL)
    [
      [1, 1],   // New Year
      [1, 6],   // Epiphany
      [5, 1],   // Labour Day
      [5, 3],   // Constitution Day
      [8, 15],  // Assumption of Mary
      [11, 1],  // All Saints' Day
      [11, 11], // Independence Day
      [12, 25], // Christmas Day
      [12, 26], // Second Day of Christmas
    ].forEach(([m, d]) => set.add(key(year, m, d)));

    const easter = getEasterDate(year);
    const easterDate = new Date(year, easter.month - 1, easter.day);
    const easterMonday = new Date(easterDate);
    easterMonday.setDate(easterMonday.getDate() + 1);
    const pentecost = new Date(easterDate);
    pentecost.setDate(pentecost.getDate() + 49);
    const corpusChristi = new Date(easterDate);
    corpusChristi.setDate(corpusChristi.getDate() + 60);

    [easterDate, easterMonday, pentecost, corpusChristi].forEach((dt) => {
      set.add(key(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()));
    });

    return set;
  };

  const renderDays = () => {
    const first = new Date(state.year, state.month, 1);
    const last = new Date(state.year, state.month + 1, 0);

    const startIndex = (first.getDay() + 6) % 7; // Monday first
    const totalDays = last.getDate();

    const prevLast = new Date(state.year, state.month, 0).getDate();

    for (let i = 0; i < startIndex; i += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-calendar__cell month-calendar__cell--outside";
      cell.textContent = String(prevLast - startIndex + i + 1);
      cell.disabled = true;
      calendarEl.appendChild(cell);
    }

    const today = new Date();
    const pad = (num) => String(num).padStart(2, "0");
    const workSet = new Set(
      loadEntriesSafe()
        .filter((e) => isWorkEntry(e) && typeof e.date === "string")
        .map((e) => e.date)
    );
    const holidaySet = buildHolidaySet(state.year);
    const eventMap = new Map(
      loadCalendarEvents()
        .filter((e) => typeof e.date === "string" && typeof e.type === "string")
        .map((e) => [e.date, e.type])
    );
    for (let day = 1; day <= totalDays; day += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-calendar__cell";
      cell.textContent = String(day);

      if (
        day === today.getDate() &&
        state.month === today.getMonth() &&
        state.year === today.getFullYear()
      ) {
        cell.classList.add("month-calendar__cell--today");
      }

      const dateKey = `${state.year}-${pad(state.month + 1)}-${pad(day)}`;
      const eventType = eventMap.get(dateKey);
      if (eventType === "vacation") cell.classList.add("month-calendar__cell--vacation");
      if (eventType === "off") cell.classList.add("month-calendar__cell--off");
      if (eventType === "l4") cell.classList.add("month-calendar__cell--l4");
      if (eventType === "absent") cell.classList.add("month-calendar__cell--absent");
      if (!eventType && workSet.has(dateKey)) {
        cell.classList.add("month-calendar__cell--work");
      }
      if (!eventType && !workSet.has(dateKey)) {
        const dateObj = new Date(state.year, state.month, day);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const isHoliday = holidaySet.has(dateKey);
        if (isWeekend || isHoliday) {
          cell.classList.add("month-calendar__cell--off");
        }
      }

      calendarEl.appendChild(cell);
    }

    const cells = calendarEl.querySelectorAll(".month-calendar__cell").length;
    const totalCells = Math.ceil(cells / 7) * 7;
    const nextCount = totalCells - cells;
    for (let i = 1; i <= nextCount; i += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-calendar__cell month-calendar__cell--outside";
      cell.textContent = String(i);
      cell.disabled = true;
      calendarEl.appendChild(cell);
    }
  };

  const renderCalendar = () => {
    clearCalendar();
    renderHeader();
    renderDays();
    monthLabelEl.textContent = `${monthNames[state.month]} ${state.year}`;
  };

  const changeMonth = (delta) => {
    const next = new Date(state.year, state.month + delta, 1);
    state.year = next.getFullYear();
    state.month = next.getMonth();
    renderCalendar();
  };

  prevBtn?.addEventListener("click", () => changeMonth(-1));
  nextBtn?.addEventListener("click", () => changeMonth(1));

  window.renderCalendar = renderCalendar;
  renderCalendar();
}

const timerDisplay = document.getElementById("timerDisplay");
const timerStatus = document.getElementById("timerStatus");
const timerStartBtn = document.getElementById("timerStartBtn");
const timerPauseBtn = document.getElementById("timerPauseBtn");
const timerStopBtn = document.getElementById("timerStopBtn");

if (timerDisplay && timerStatus && timerStartBtn && timerPauseBtn && timerStopBtn) {
  let startTimestamp = 0;
  let elapsedMs = 0;
  let rafId = null;
  let running = false;
  let startClock = null;

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const tick = () => {
    if (!running) return;
    const now = Date.now();
    const total = elapsedMs + (now - startTimestamp);
    timerDisplay.textContent = formatTime(total);
    rafId = requestAnimationFrame(tick);
  };

  const setStatus = (label) => {
    timerStatus.textContent = label;
  };

  const setButtons = (state) => {
    if (state === "idle") {
      timerStartBtn.disabled = false;
      timerPauseBtn.disabled = true;
      timerStopBtn.disabled = true;
    } else if (state === "running") {
      timerStartBtn.disabled = true;
      timerPauseBtn.disabled = false;
      timerStopBtn.disabled = false;
    } else if (state === "paused") {
      timerStartBtn.disabled = false;
      timerPauseBtn.disabled = true;
      timerStopBtn.disabled = false;
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    startTimestamp = Date.now();
    startClock = new Date();
    setStatus("Aktywny");
    setButtons("running");
    rafId = requestAnimationFrame(tick);
  };

  const pause = () => {
    if (!running) return;
    running = false;
    elapsedMs += Date.now() - startTimestamp;
    setStatus("Wstrzymany");
    setButtons("paused");
    if (rafId) cancelAnimationFrame(rafId);
  };

  const stop = () => {
    const totalMs = elapsedMs + (running ? Date.now() - startTimestamp : 0);
    const endClock = new Date();
    running = false;
    elapsedMs = 0;
    startTimestamp = 0;
    timerDisplay.textContent = "00:00:00";
    setStatus("Nieaktywny");
    setButtons("idle");
    if (rafId) cancelAnimationFrame(rafId);

    if (totalMs > 0 && startClock) {
      const hours = totalMs / 3600000;
      const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: "work",
        date: localDateKey(startClock),
        start: formatClock(startClock),
        end: formatClock(endClock),
        hours,
      };
      const entries = loadEntriesSafe();
      entries.push(entry);
      saveEntriesSafe(entries);
      refreshAll();
    }
    startClock = null;
  };

  timerStartBtn.addEventListener("click", () => start());
  timerPauseBtn.addEventListener("click", () => pause());
  timerStopBtn.addEventListener("click", () => stop());

  setButtons("idle");
}

const weekBarsEl = document.getElementById("weekBars");
const renderWeekBars = () => {
  if (!weekBarsEl) return;
  const labels = ["Pn", "Wt", "Sr", "Czw", "Pt", "Sob", "Ndz"];
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - day);

  const entries = loadEntriesSafe().filter(isWorkEntry);
  const totals = new Array(7).fill(0);
  entries.forEach((entry) => {
    if (!entry.date || typeof entry.hours !== "number") return;
    const entryDate = new Date(entry.date);
    entryDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((entryDate - monday) / 86400000);
    if (diffDays >= 0 && diffDays < 7) {
      totals[diffDays] += entry.hours;
    }
  });

  const maxHours = Math.max(8, ...totals);
  weekBarsEl.innerHTML = "";
  totals.forEach((hours, idx) => {
    const bar = document.createElement("div");
    bar.className = "week-bar";

    const track = document.createElement("div");
    track.className = "week-bar__track";

    const fill = document.createElement("div");
    fill.className = "week-bar__fill";
    const pct = maxHours > 0 ? (hours / maxHours) * 100 : 0;
    fill.style.height = `${Math.max(hours > 0 ? 6 : 4, pct)}%`;

    const meta = document.createElement("div");
    meta.className = "week-bar__meta";

    const value = document.createElement("strong");
    value.textContent = `${hours.toFixed(1)}h`;

    const label = document.createElement("span");
    label.textContent = labels[idx];

    track.appendChild(fill);
    meta.appendChild(value);
    meta.appendChild(label);
    bar.appendChild(track);
    bar.appendChild(meta);
    weekBarsEl.appendChild(bar);
  });
};

renderWeekBars();
const calendarAddBtn = document.getElementById("calendarAddBtn");
const calendarEventModal = document.getElementById("calendarEventModal");
const calendarEventFrom = document.getElementById("calendarEventFrom");
const calendarEventTo = document.getElementById("calendarEventTo");
const calendarEventType = document.getElementById("calendarEventType");
const calendarEventSaveBtn = document.getElementById("calendarEventSaveBtn");
const calendarEventCancelBtn = document.getElementById("calendarEventCancelBtn");
const calendarEventFromDisplay = document.getElementById("calendarEventFromDisplay");
const calendarEventToDisplay = document.getElementById("calendarEventToDisplay");

const showCalendarModal = (show) => {
  if (!calendarEventModal) return;
  calendarEventModal.hidden = !show;
};

const syncCalendarDisplays = () => {
  if (calendarEventFromDisplay && calendarEventFrom) {
    calendarEventFromDisplay.value = calendarEventFrom.value || "";
  }
  if (calendarEventToDisplay && calendarEventTo) {
    calendarEventToDisplay.value = calendarEventTo.value || "";
  }
};

if (calendarAddBtn) {
  calendarAddBtn.addEventListener("click", () => {
    const today = new Date().toISOString().slice(0, 10);
    if (calendarEventFrom) calendarEventFrom.value = today;
    if (calendarEventTo) calendarEventTo.value = today;
    if (calendarEventType) calendarEventType.value = "vacation";
    syncCalendarDisplays();
    showCalendarModal(true);
  });
}

if (calendarEventCancelBtn) {
  calendarEventCancelBtn.addEventListener("click", () => {
    showCalendarModal(false);
  });
}

if (calendarEventFrom) {
  calendarEventFrom.addEventListener("change", syncCalendarDisplays);
}
if (calendarEventTo) {
  calendarEventTo.addEventListener("change", syncCalendarDisplays);
}

if (calendarEventSaveBtn) {
  calendarEventSaveBtn.addEventListener("click", () => {
    if (!calendarEventFrom || !calendarEventTo || !calendarEventType) return;
    const from = calendarEventFrom.value;
    const to = calendarEventTo.value;
    const type = calendarEventType.value;
    if (!from || !to) return;
    const start = new Date(from);
    const end = new Date(to);
    if (end < start) return;

    const events = loadCalendarEvents();
    const dayMs = 86400000;
    const dateKeys = new Set();
    for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dateKeys.add(key);
    }

    const nextEvents = events.filter((event) => !dateKeys.has(event.date));
    dateKeys.forEach((date) => nextEvents.push({ date, type }));
    saveCalendarEvents(nextEvents);
    showCalendarModal(false);
    refreshAll();
  });
}

let deferredPrompt = null;

const isIos = (() => {
  const ua = navigator.userAgent || "";
  const appleMobile = /iphone|ipad|ipod/i.test(ua);
  const ipadDesktop = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return appleMobile || ipadDesktop;
})();

const isStandalone = (() => {
  const displayMode = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  return displayMode || window.navigator.standalone === true;
})();

const showInstallBanner = () => {
  if (!installBanner) return;
  if (isStandalone) {
    installBanner.hidden = true;
    return;
  }
  if (isIos) {
    if (installBtn) installBtn.hidden = true;
    if (installIosBtn) installIosBtn.hidden = false;
    installBanner.hidden = false;
  }
};

const toggleIosGuide = (show) => {
  if (!iosInstallGuide) return;
  iosInstallGuide.hidden = !show;
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker.js");
      showInstallBanner();
      if (reg.waiting) {
        reg.waiting.postMessage("SKIP_WAITING");
      }
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) {
            next.postMessage("SKIP_WAITING");
          }
        });
      });
    } catch {
      showInstallBanner();
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
} else {
  showInstallBanner();
}

const requestSwUpdate = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg) {
      await reg.update();
    }
  } catch {}
};

let lastRemoteRefresh = 0;
const refreshRemoteData = async (force = false) => {
  if (!navigator.onLine) return;
  const now = Date.now();
  if (!force && now - lastRemoteRefresh < 60_000) return;
  lastRemoteRefresh = now;

  await Promise.allSettled([
    loadRankConfig().then(() => {
      updateRankUI();
      renderCommunityList();
    }),
    loadCommunityConfig().then(() => {
      purgeCommunityDemoData();
      renderCommunityOverview();
      renderCommunityList();
    }),
    loadEarningsConfig().then(() => {
      computeEarnings();
      renderSelectedMonthEarnings();
      updateEarningsForecast();
    }),
    seedAchievementsFromFile().then(() => {
      renderAchievements();
      renderCommunityList();
    }),
  ]);

  renderWeeklyChallenges();
};

window.addEventListener("focus", () => {
  refreshRemoteData();
  requestSwUpdate();
});

window.addEventListener("online", () => {
  refreshRemoteData(true);
  requestSwUpdate();
  updateConnectionIndicator();
});

window.addEventListener("offline", () => {
  updateConnectionIndicator();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshRemoteData();
    requestSwUpdate();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  if (!installBanner) return;
  event.preventDefault();
  deferredPrompt = event;
  if (installIosBtn) installIosBtn.hidden = true;
  if (installBtn) installBtn.hidden = false;
  installBanner.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  if (installBanner) {
    installBanner.hidden = true;
  }
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBanner.hidden = true;
  });
}

if (installCloseBtn) {
  installCloseBtn.addEventListener("click", () => {
    if (installBanner) installBanner.hidden = true;
  });
}

if (installIosBtn) {
  installIosBtn.addEventListener("click", () => {
    toggleIosGuide(true);
  });
}

if (iosInstallCloseBtn) {
  iosInstallCloseBtn.addEventListener("click", () => {
    toggleIosGuide(false);
  });
}

if (iosInstallDoneBtn) {
  iosInstallDoneBtn.addEventListener("click", () => {
    toggleIosGuide(false);
  });
}

const plannerForm = document.getElementById("plannerForm");
const plannerTitleInput = document.getElementById("plannerTitleInput");
const plannerStartDateInput = document.getElementById("plannerStartDateInput");
const plannerEndDateInput = document.getElementById("plannerEndDateInput");
const plannerStartDateDisplay = document.getElementById("plannerStartDateDisplay");
const plannerEndDateDisplay = document.getElementById("plannerEndDateDisplay");
const plannerContentInput = document.getElementById("plannerContentInput");
const plannerPinnedInput = document.getElementById("plannerPinnedInput");
const plannerNotesList = document.getElementById("plannerNotesList");
const plannerRefreshBtn = document.getElementById("plannerRefreshBtn");
const plannerStatus = document.getElementById("plannerStatus");
const plannerCalendarPrevBtn = document.getElementById("plannerCalendarPrevBtn");
const plannerCalendarNextBtn = document.getElementById("plannerCalendarNextBtn");
const plannerCalendarMonthLabel = document.getElementById("plannerCalendarMonthLabel");
const plannerCalendarGrid = document.getElementById("plannerCalendarGrid");
const plannerSelectedDateLabel = document.getElementById("plannerSelectedDateLabel");
const plannerSelectedDateMeta = document.getElementById("plannerSelectedDateMeta");
const plannerDayAgenda = document.getElementById("plannerDayAgenda");

const productionForm = document.getElementById("productionForm");
const productionDateInput = document.getElementById("productionDate");
const productionProductInput = document.getElementById("productionProduct");
const productionQtyInput = document.getElementById("productionQty");
const productionList = document.getElementById("productionList");
const productionSummary = document.getElementById("productionSummary");
const productionRefreshBtn = document.getElementById("productionRefreshBtn");

const plannerKey = "planner.notes.v1";
const productionKey = "planner.production.v1";

const loadPlannerNotesLocal = () => {
  const raw = storage.getItem(plannerKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const savePlannerNotesLocal = (notes) => {
  storage.setItem(plannerKey, JSON.stringify(notes));
};

const loadPlannerNotes = () => {
  if (plannerUsesSupabase()) {
    return Array.isArray(supabasePlannerNotes) ? supabasePlannerNotes : [];
  }
  return loadPlannerNotesLocal();
};

const loadProductionEntries = () => {
  const raw = storage.getItem(productionKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const saveProductionEntries = (items) => {
  storage.setItem(productionKey, JSON.stringify(items));
};

const normalizePlannerRow = (row) => ({
  id: String(row?.id ?? ""),
  title: row?.title ? String(row.title) : "",
  content: row?.content ? String(row.content) : "",
  startDate: row?.start_date ? String(row.start_date) : "",
  endDate: row?.end_date ? String(row.end_date) : "",
  pinned: Boolean(row?.pinned),
  createdAt: row?.created_at ? new Date(row.created_at).getTime() : Date.now(),
  createdBy: row?.created_by || null,
  authorName: row?.author_name ? String(row.author_name) : "",
  authorAvatar: row?.author_avatar ? String(row.author_avatar) : "",
});

const buildPlannerPayload = (note) => {
  const profile = loadProfile();
  const createdAt = note?.createdAt
    ? new Date(note.createdAt).toISOString()
    : new Date().toISOString();
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    start_date: note.startDate || null,
    end_date: note.endDate || null,
    pinned: !!note.pinned,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    author_name: profile.name || null,
    author_avatar: profile.avatarUrl || null,
  };
};

const fetchPlannerNotesFromSupabase = async () => {
  if (!plannerUsesSupabase() || supabasePlannerLoading) return false;
  supabasePlannerLoading = true;
  try {
    const { data, error } = await supabaseClient
      .from(supabasePlannerTable)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    supabasePlannerLoading = false;
    if (error) {
      if (plannerStatus) plannerStatus.textContent = "Błąd pobierania planera.";
      return false;
    }
    supabasePlannerNotes = Array.isArray(data) ? data.map(normalizePlannerRow) : [];
    return true;
  } catch {
    supabasePlannerLoading = false;
    if (plannerStatus) plannerStatus.textContent = "Błąd pobierania planera.";
    return false;
  }
};

const syncLocalPlannerToSupabase = async () => {
  if (!plannerUsesSupabase()) return;
  const localNotes = loadPlannerNotesLocal();
  if (!localNotes.length) return;
  if (!Array.isArray(supabasePlannerNotes)) {
    const fetched = await fetchPlannerNotesFromSupabase();
    if (!fetched) return;
  }
  const existingIds = new Set((supabasePlannerNotes || []).map((note) => note.id));
  const toInsert = localNotes.filter((note) => note && !existingIds.has(note.id));
  if (!toInsert.length) return;
  const payload = toInsert.map((note) => buildPlannerPayload(note));
  const { error } = await supabaseClient.from(supabasePlannerTable).insert(payload);
  if (error) {
    if (plannerStatus) plannerStatus.textContent = "Nie udało się wysłać zadań do planera.";
    return;
  }
  await fetchPlannerNotesFromSupabase();
};

const refreshPlannerFromSupabase = async (options = {}) => {
  if (!plannerUsesSupabase()) return;
  const updated = await fetchPlannerNotesFromSupabase();
  if (!updated) return;
  if (options?.syncLocal) {
    await syncLocalPlannerToSupabase();
  }
  renderPlannerNotes();
};

const addPlannerNoteSupabase = async (note) => {
  if (!plannerUsesSupabase()) return false;
  if (plannerStatus) plannerStatus.textContent = "Zapisywanie...";
  try {
    const payload = buildPlannerPayload(note);
    const { data, error } = await supabaseClient
      .from(supabasePlannerTable)
      .insert(payload)
      .select("*");
    if (error) {
      if (plannerStatus) plannerStatus.textContent = "Błąd zapisu w planerze.";
      return false;
    }
    if (Array.isArray(data) && data[0]) {
      const normalized = normalizePlannerRow(data[0]);
      supabasePlannerNotes = Array.isArray(supabasePlannerNotes)
        ? [normalized, ...supabasePlannerNotes]
        : [normalized];
    } else {
      await fetchPlannerNotesFromSupabase();
    }
    if (plannerStatus) plannerStatus.textContent = "";
    renderPlannerNotes();
    return true;
  } catch {
    if (plannerStatus) plannerStatus.textContent = "Błąd zapisu w planerze.";
    return false;
  }
};

const deletePlannerNoteSupabase = async (noteId) => {
  if (!plannerUsesSupabase()) return false;
  if (plannerStatus) plannerStatus.textContent = "Usuwanie...";
  try {
    const { error } = await supabaseClient
      .from(supabasePlannerTable)
      .delete()
      .eq("id", noteId);
    if (error) {
      if (plannerStatus) plannerStatus.textContent = "Nie udało się usunąć zadania.";
      return false;
    }
    supabasePlannerNotes = Array.isArray(supabasePlannerNotes)
      ? supabasePlannerNotes.filter((note) => note.id !== noteId)
      : [];
    if (plannerStatus) plannerStatus.textContent = "";
    renderPlannerNotes();
    renderPlannerCalendar();
    renderPlannerDayAgenda();
    return true;
  } catch {
    if (plannerStatus) plannerStatus.textContent = "Nie udało się usunąć zadania.";
    return false;
  }
};

const addProductionEntrySupabase = async (payload) => {
  if (!productionUsesSupabase()) return false;
  try {
    const { data, error } = await supabaseClient
      .from(supabaseProductionTable)
      .insert(payload)
      .select();
    if (error) {
      setSupabaseStatus("Błąd zapisu produkcji.", true);
      return false;
    }
    if (Array.isArray(data) && data[0]) {
      const normalized = normalizeProductionRow(data[0]);
      supabaseProductionEntries = Array.isArray(supabaseProductionEntries)
        ? [normalized, ...supabaseProductionEntries]
        : [normalized];
    } else {
      await fetchProductionFromSupabase(payload.date);
    }
    return true;
  } catch {
    setSupabaseStatus("Błąd zapisu produkcji.", true);
    return false;
  }
};

const deleteProductionEntrySupabase = async (entryId, dateFilter = "") => {
  if (!productionUsesSupabase()) return false;
  try {
    const { error } = await supabaseClient
      .from(supabaseProductionTable)
      .delete()
      .eq("id", entryId);
    if (error) {
      setSupabaseStatus("Błąd usuwania produkcji.", true);
      return false;
    }
    if (Array.isArray(supabaseProductionEntries)) {
      supabaseProductionEntries = supabaseProductionEntries.filter((row) => row.id !== entryId);
    }
    renderProductionList();
    refreshProductionFromSupabase(dateFilter);
    return true;
  } catch {
    setSupabaseStatus("Błąd usuwania produkcji.", true);
    return false;
  }
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const pad2 = (value) => String(value).padStart(2, "0");

const formatDateLabel = (value) => {
  if (!value) return "-";
  return value;
};

let plannerCalendarOffset = 0;
let plannerSelectedDate = null;

const parseDateKey = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizePlannerRange = (note) => {
  const start = parseDateKey(note?.startDate);
  const end = parseDateKey(note?.endDate);
  if (!start && !end) return null;
  if (start && !end) return { start, end: start };
  if (!start && end) return { start: end, end };
  if (end < start) return { start: end, end: start };
  return { start, end };
};

const noteCoversDate = (note, dateKey) => {
  const range = normalizePlannerRange(note);
  if (!range) return false;
  const date = parseDateKey(dateKey);
  if (!date) return false;
  return date >= range.start && date <= range.end;
};

const getPlannerNotesForDate = (dateKey, notes) =>
  notes.filter((note) => note && noteCoversDate(note, dateKey));

const renderPlannerDayAgenda = () => {
  if (!plannerDayAgenda) return;
  const notes = loadPlannerNotes();
  const dateKey = plannerSelectedDate || getTodayKey();

  if (plannerSelectedDateLabel) {
    const date = parseDateKey(dateKey);
    plannerSelectedDateLabel.textContent = date
      ? date.toLocaleDateString("pl-PL")
      : dateKey;
  }

  const items = getPlannerNotesForDate(dateKey, notes);
  if (plannerSelectedDateMeta) {
    plannerSelectedDateMeta.textContent =
      items.length === 0 ? "Brak zadań na ten dzień." : `Zadań: ${items.length}`;
  }

  plannerDayAgenda.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entries-v3-empty";
    empty.textContent = "Brak zaplanowanych zadań.";
    plannerDayAgenda.appendChild(empty);
    return;
  }

  items.forEach((note) => {
    const li = document.createElement("li");
    li.className = "planner-day-item";
    const title = document.createElement("div");
    title.className = "planner-day-item__title";
    title.textContent = note.title || "Bez tytułu";
    const meta = document.createElement("div");
    meta.className = "planner-day-item__meta";
    meta.textContent = `Od ${formatDateLabel(note.startDate)} do ${formatDateLabel(note.endDate)}`;
    li.appendChild(title);
    li.appendChild(meta);
    plannerDayAgenda.appendChild(li);
  });
};

const renderPlannerCalendar = () => {
  if (!plannerCalendarGrid || !plannerCalendarMonthLabel) return;
  const base = new Date();
  base.setDate(1);
  base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() + plannerCalendarOffset);

  const year = base.getFullYear();
  const month = base.getMonth();
  plannerCalendarMonthLabel.textContent = base.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = last.getDate();
  const monthKey = `${year}-${pad2(month + 1)}`;

  if (!plannerSelectedDate || !plannerSelectedDate.startsWith(monthKey)) {
    const today = getTodayKey();
    plannerSelectedDate = today.startsWith(monthKey)
      ? today
      : `${monthKey}-01`;
  }

  plannerCalendarGrid.innerHTML = "";

  for (let i = 0; i < startDay; i += 1) {
    const empty = document.createElement("div");
    empty.className = "community-day is-empty";
    plannerCalendarGrid.appendChild(empty);
  }

  const notes = loadPlannerNotes();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${pad2(day)}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "community-day community-day--clickable";
    if (plannerSelectedDate === dateKey) {
      btn.classList.add("is-selected");
    }
    btn.textContent = String(day);

    const tasksForDay = getPlannerNotesForDate(dateKey, notes);
    if (tasksForDay.length > 0) {
      btn.classList.add("has-tasks");
      const dots = document.createElement("div");
      dots.className = "community-day__dots";
      const dot = document.createElement("span");
      const hasPinned = tasksForDay.some((note) => note && note.pinned);
      dot.className = hasPinned
        ? "cal-dot cal-dot--important"
        : "cal-dot cal-dot--work";
      dots.appendChild(dot);
      btn.appendChild(dots);
    }

    btn.addEventListener("click", () => {
      plannerSelectedDate = dateKey;
      renderPlannerCalendar();
      renderPlannerDayAgenda();
    });

    plannerCalendarGrid.appendChild(btn);
  }

  const totalCells = startDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i += 1) {
    const empty = document.createElement("div");
    empty.className = "community-day is-empty";
    plannerCalendarGrid.appendChild(empty);
  }

  renderPlannerDayAgenda();
};

const renderPlannerNotes = () => {
  if (!plannerNotesList) return;
  const notes = loadPlannerNotes();
  plannerNotesList.innerHTML = "";

  if (plannerStatus) {
    plannerStatus.textContent =
      notes.length === 0 ? "Brak zadan. Dodaj nowe ponizej." : "";
  }

  if (notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "planner-empty";
    empty.textContent = "Brak zadan w planerze.";
    plannerNotesList.appendChild(empty);
    return;
  }

  notes
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    })
    .forEach((note) => {
      const item = document.createElement("li");
      item.className = "planner-note";

      const top = document.createElement("div");
      top.className = "planner-note__top";

      const head = document.createElement("div");
      head.className = "planner-note__head";

      const title = document.createElement("strong");
      title.textContent = note.title || "Bez tytulu";

      const meta = document.createElement("p");
      meta.className = "planner-note__meta";
      meta.textContent = `Od ${formatDateLabel(note.startDate)} do ${formatDateLabel(
        note.endDate
      )}`;

      head.appendChild(title);
      head.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "planner-note__actions";

      if (note.pinned) {
        const badge = document.createElement("span");
        badge.className = "planner-note__badge";
        badge.textContent = "Wazne";
        actions.appendChild(badge);
      }

      const canDelete =
        !plannerUsesSupabase() ||
        (note.createdBy && supabaseUser && note.createdBy === supabaseUser.id);

      if (canDelete) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "planner-note__delete";
        removeBtn.type = "button";
        removeBtn.textContent = "Usun";
        removeBtn.addEventListener("click", async () => {
          const ok = await showConfirmDialog("Usunąć to zadanie?", "Usuń zadanie");
          if (!ok) return;
          if (plannerUsesSupabase()) {
            await deletePlannerNoteSupabase(note.id);
            return;
          }
          const next = loadPlannerNotesLocal().filter((item) => item.id !== note.id);
          savePlannerNotesLocal(next);
          renderPlannerNotes();
          renderPlannerCalendar();
          renderPlannerDayAgenda();
        });
        actions.appendChild(removeBtn);
      }

      top.appendChild(head);
      top.appendChild(actions);

      const content = document.createElement("p");
      content.className = "planner-note__content";
      content.textContent = note.content || "Brak tresci.";

      const footer = document.createElement("p");
      footer.className = "planner-note__footer";
      const footerParts = [`Dodano: ${new Date(note.createdAt).toLocaleDateString()}`];
      if (note.authorName) footerParts.push(`Autor: ${note.authorName}`);
      footer.textContent = footerParts.join(" • ");

      item.appendChild(top);
      item.appendChild(content);
      item.appendChild(footer);

      plannerNotesList.appendChild(item);
    });

  renderPlannerCalendar();
};

const renderProductionList = () => {
  if (!productionList || !productionSummary || !productionDateInput) return;
  const selectedDate = productionDateInput.value || getTodayKey();
  let items = [];
  if (productionUsesSupabase()) {
    if (!Array.isArray(supabaseProductionEntries)) {
      productionSummary.textContent = "Ladowanie produkcji...";
      productionList.innerHTML = "";
      return;
    }
    items = supabaseProductionEntries.filter((item) => item && item.date === selectedDate);
  } else {
    items = loadProductionEntries().filter((item) => item && item.date === selectedDate);
  }

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  productionSummary.textContent =
    items.length === 0
      ? "Brak produkcji dla wybranego dnia."
      : `Dzien: ${selectedDate} | Pozycji: ${items.length} | Suma sztuk: ${totalQty}`;

  productionList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entries-v3-empty";
    empty.textContent = "Brak wpisow produkcji.";
    productionList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "production-item";

    const left = document.createElement("div");
    left.className = "production-item__left";
    if (item.authorAvatar || item.authorName) {
      const avatar = document.createElement("div");
      avatar.className = "production-item__avatar";
      setAvatar(avatar, item.authorAvatar, item.authorName || "U");
      left.appendChild(avatar);
    }
    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "production-item__name";
    name.textContent = item.product || "Produkt";

    const meta = document.createElement("div");
    meta.className = "production-item__meta";
    const authorLabel = item.authorName ? ` • ${item.authorName}` : "";
    meta.textContent = `${selectedDate}${authorLabel}`;

    text.appendChild(name);
    text.appendChild(meta);
    left.appendChild(text);

    const right = document.createElement("div");
    right.className = "flex-row align-center gap-2";

    const qty = document.createElement("div");
    qty.className = "production-item__qty";
    qty.textContent = `${Number(item.qty) || 0} szt.`;

    const remove = document.createElement("button");
    remove.className = "production-item__remove";
    remove.type = "button";
    remove.textContent = "Usun";
    remove.addEventListener("click", async () => {
      const ok = await showConfirmDialog(
        "Usunac ten wpis produkcji?",
        "Usun wpis"
      );
      if (!ok) return;
      if (productionUsesSupabase()) {
        if (item.createdBy && supabaseUser && item.createdBy !== supabaseUser.id) {
          setSupabaseStatus("Nie możesz usunąć cudzej produkcji.", true);
          return;
        }
        await deleteProductionEntrySupabase(item.id, selectedDate);
        return;
      }
      const next = loadProductionEntries().filter((row) => row.id !== item.id);
      saveProductionEntries(next);
      renderProductionList();
    });

    right.appendChild(qty);
    right.appendChild(remove);

    li.appendChild(left);
    li.appendChild(right);
    productionList.appendChild(li);
  });
};

if (productionDateInput) {
  productionDateInput.value = getTodayKey();
  productionDateInput.addEventListener("change", () => {
    const selectedDate = productionDateInput.value || getTodayKey();
    if (productionUsesSupabase()) {
      refreshProductionFromSupabase(selectedDate);
      return;
    }
    renderProductionList();
  });
}

if (productionRefreshBtn) {
  productionRefreshBtn.addEventListener("click", () => {
    playClickSound();
    const selectedDate = productionDateInput?.value || getTodayKey();
    if (productionUsesSupabase()) {
      refreshProductionFromSupabase(selectedDate);
      return;
    }
    renderProductionList();
  });
}

if (productionForm && productionDateInput && productionProductInput && productionQtyInput) {
  productionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = productionDateInput.value || getTodayKey();
    const product = productionProductInput.value.trim();
    const qty = Number(productionQtyInput.value);
    if (!product || !Number.isFinite(qty) || qty <= 0) return;

    if (productionUsesSupabase()) {
      const profile = loadProfile();
      addProductionEntrySupabase({
        date,
        product,
        qty,
        created_by: supabaseUser?.id || null,
        author_name: profile.name || null,
        author_avatar: profile.avatarUrl || null,
      }).then(() => {
        productionProductInput.value = "";
        productionQtyInput.value = "";
        renderProductionList();
      });
      return;
    }
    const entries = loadProductionEntries();
    entries.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date,
      product,
      qty,
    });
    saveProductionEntries(entries);
    productionProductInput.value = "";
    productionQtyInput.value = "";
    renderProductionList();
  });
}

const syncPlannerDateDisplay = () => {
  if (plannerStartDateDisplay) {
    plannerStartDateDisplay.value = formatDateLabel(plannerStartDateInput?.value);
  }
  if (plannerEndDateDisplay) {
    plannerEndDateDisplay.value = formatDateLabel(plannerEndDateInput?.value);
  }
};

if (plannerStartDateInput && plannerStartDateDisplay) {
  plannerStartDateInput.addEventListener("change", syncPlannerDateDisplay);
}
if (plannerEndDateInput && plannerEndDateDisplay) {
  plannerEndDateInput.addEventListener("change", syncPlannerDateDisplay);
}

if (plannerForm && plannerTitleInput && plannerContentInput) {
  plannerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = plannerTitleInput.value.trim();
    const content = plannerContentInput.value.trim();
    const startDate = plannerStartDateInput?.value || "";
    const endDate = plannerEndDateInput?.value || "";
    const pinned = !!plannerPinnedInput?.checked;

    if (!title || !content) {
      if (plannerStatus) {
        plannerStatus.textContent = "Uzupelnij tytul i tresc zadania.";
      }
      return;
    }

    const newNote = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      content,
      startDate,
      endDate,
      pinned,
      createdAt: Date.now(),
    };

    if (plannerUsesSupabase()) {
      addPlannerNoteSupabase(newNote);
    } else {
      const notes = loadPlannerNotesLocal();
      notes.push(newNote);
      savePlannerNotesLocal(notes);
      renderPlannerNotes();
    }
    plannerForm.reset();
    syncPlannerDateDisplay();
    if (plannerStatus) plannerStatus.textContent = "";
  });
}

if (plannerRefreshBtn) {
  plannerRefreshBtn.addEventListener("click", () => {
    playClickSound();
    if (plannerUsesSupabase()) {
      refreshPlannerFromSupabase();
      return;
    }
    renderPlannerNotes();
    renderPlannerCalendar();
  });
}

if (communityRefreshBtn) {
  communityRefreshBtn.addEventListener("click", () => {
    playClickSound();
    if (supabaseEnabled && supabaseClient && supabaseUser) {
      refreshCommunityFromSupabase();
      return;
    }
    renderCommunityOverview();
    renderCommunityList();
  });
}

syncPlannerDateDisplay();
renderPlannerNotes();
renderPlannerCalendar();

if (plannerCalendarPrevBtn) {
  plannerCalendarPrevBtn.addEventListener("click", () => {
    plannerCalendarOffset -= 1;
    renderPlannerCalendar();
  });
}
if (plannerCalendarNextBtn) {
  plannerCalendarNextBtn.addEventListener("click", () => {
    plannerCalendarOffset += 1;
    renderPlannerCalendar();
  });
}

const achievementList = document.getElementById("achievementsList");
const nextAchievement = document.getElementById("nextAchievement");

const achievementKey = "achievements.v1";
const achievementsSourceUrl = "./achievements.json";
const maxVisibleAchievements = 3;
const achievementBatchKey = "achievements.batch.v1";
const achievementActivityKey = "achievements.activity.v1";

const getLastAchievementBatchStart = (total, batchSize) => {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.floor((total - 1) / batchSize) * batchSize);
};

const getAchievementBatchStart = (total, batchSize) => {
  if (!total || total <= 0) return 0;
  const raw = storage.getItem(achievementBatchKey);
  const value = Number(raw);
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const lastStart = getLastAchievementBatchStart(total, batchSize);
  return Math.min(Math.floor(safe / batchSize) * batchSize, lastStart);
};

const setAchievementBatchStart = (start) => {
  storage.setItem(achievementBatchKey, String(Math.max(0, Math.floor(start || 0))));
};

const advanceAchievementBatch = (items, start, batchSize) => {
  if (!items.length) return 0;
  const total = items.length;
  const lastStart = getLastAchievementBatchStart(total, batchSize);
  let nextStart = start;

  while (nextStart < total) {
    const batchItems = items.slice(nextStart, nextStart + batchSize);
    if (!batchItems.length) break;
    const allUnlocked = batchItems.every((item) => item.unlocked);
    if (allUnlocked && nextStart < lastStart) {
      nextStart += batchSize;
      continue;
    }
    break;
  }

  return Math.min(nextStart, lastStart);
};

const normalizeAchievementCriteria = (criteria) => {
  if (!criteria || typeof criteria !== "object") return null;
  const type = criteria.type ? String(criteria.type) : "";
  const target = Number(criteria.target);
  if (!type || !Number.isFinite(target)) return null;
  return { type, target };
};

const normalizeAchievement = (item, index) => {
  const fallbackId = `seed-${index}`;
  return {
    id: String(item?.id ?? fallbackId),
    title: String(item?.title ?? "Osiagniecie"),
    desc: item?.desc ? String(item.desc) : "",
    rarity: item?.rarity ? String(item.rarity) : "POSPOLITE",
    exp: Number.isFinite(Number(item?.exp)) ? Number(item.exp) : 0,
    unlocked: Boolean(item?.unlocked),
    criteria: normalizeAchievementCriteria(item?.criteria),
    progress: item?.progress ? String(item.progress) : null,
  };
};

const loadAchievements = () => {
  const raw = storage.getItem(achievementKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAchievement);
  } catch {
    return [];
  }
};

const saveAchievements = (items) => {
  storage.setItem(achievementKey, JSON.stringify(items));
};

const mergeAchievements = (incoming, existing) => {
  const existingById = new Map(
    existing.filter((item) => item && item.id).map((item) => [String(item.id), item])
  );
  const merged = incoming.map((item, index) => {
    const normalized = normalizeAchievement(item, index);
    const prev = existingById.get(normalized.id);
    if (!prev) return normalized;
    return {
      ...normalized,
      unlocked: prev.unlocked ?? normalized.unlocked,
      progress: prev.progress ?? normalized.progress,
      exp: Number.isFinite(Number(prev.exp)) ? Number(prev.exp) : normalized.exp,
    };
  });
  const incomingIds = new Set(merged.map((item) => item.id));
  existing.forEach((item, index) => {
    if (!item?.id || incomingIds.has(String(item.id))) return;
    merged.push(normalizeAchievement(item, merged.length + index));
  });
  return merged;
};

const seedAchievementsFromFile = async () => {
  const existing = loadAchievements();
  try {
    const response = await fetch(achievementsSourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Fetch failed");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid achievements data");
    const merged = mergeAchievements(data, existing);
    saveAchievements(merged);
  } catch {
    // If achievements.json can't be loaded, do not seed from script.js.
    // Keep existing storage as-is.
  }
};

const formatAchievementNumber = (value, decimals = 1) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(safe * factor) / factor;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(decimals);
};

const getAchievementStats = () => {
  const entries = loadEntriesSafe().filter(isWorkEntry);
  const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const monthHours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  const datesSet = new Set(entries.map((e) => e.date));
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!datesSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const { level } = computeLevelingFromExp(getEffectiveTotalExp());

  return { totalHours, monthHours, streak, level };
};

const evaluateAchievementCriteria = (criteria, stats) => {
  if (!criteria || !stats) return null;
  const target = Number(criteria.target) || 0;
  if (!Number.isFinite(target) || target <= 0) return null;

  switch (criteria.type) {
    case "total_hours": {
      const value = stats.totalHours || 0;
      const progress = `${formatAchievementNumber(value)}/${formatAchievementNumber(target)} h`;
      return { achieved: value >= target, progress };
    }
    case "month_hours": {
      const value = stats.monthHours || 0;
      const progress = `${formatAchievementNumber(value)}/${formatAchievementNumber(target)} h`;
      return { achieved: value >= target, progress };
    }
    case "streak": {
      const value = Math.max(0, Math.floor(Number(stats.streak) || 0));
      const progress = `${Math.min(value, target)}/${target} dni`;
      return { achieved: value >= target, progress };
    }
    case "level": {
      const value = Math.max(1, Math.floor(Number(stats.level) || 1));
      const progress = `${Math.min(value, target)}/${target} lvl`;
      return { achieved: value >= target, progress };
    }
    default:
      return null;
  }
};

const updateAchievementsFromStats = () => {
  const items = loadAchievements();
  if (!items.length) return;
  const stats = getAchievementStats();
  const hasActivityNow =
    (stats.totalHours || 0) > 0 || (stats.monthHours || 0) > 0 || (stats.streak || 0) > 0 || (stats.level || 1) > 1;
  const hadActivity = storage.getItem(achievementActivityKey) === "true";
  if (hasActivityNow && !hadActivity) {
    storage.setItem(achievementActivityKey, "true");
  }
  const activityEnabled = hasActivityNow || hadActivity;
  if (!activityEnabled) {
    setAchievementBatchStart(0);
  }
  let changed = false;
  const next = items.map((item) => {
    if (!item?.criteria) return item;
    const evaluation = evaluateAchievementCriteria(item.criteria, stats);
    if (!evaluation) return item;
    const unlocked = activityEnabled ? item.unlocked || evaluation.achieved : evaluation.achieved;
    const progress = unlocked ? null : evaluation.progress;
    if (unlocked !== item.unlocked || progress !== item.progress) {
      changed = true;
    }
    return { ...item, unlocked, progress };
  });
  if (changed) saveAchievements(next);
};

const renderAchievements = () => {
  if (!achievementList) return;
  const items = loadAchievements();
  const batchSize = maxVisibleAchievements;
  let batchStart = getAchievementBatchStart(items.length, batchSize);
  const nextStart = advanceAchievementBatch(items, batchStart, batchSize);
  if (nextStart !== batchStart) {
    batchStart = nextStart;
    setAchievementBatchStart(batchStart);
  }
  const listItems = items.slice(batchStart, batchStart + batchSize);
  const locked = items.filter((item) => !item.unlocked);
  const lockedInBatch = listItems.filter((item) => !item.unlocked);

  achievementList.innerHTML = "";

  if (nextAchievement) {
    if (lockedInBatch.length > 0) {
      nextAchievement.textContent = lockedInBatch[0].title;
    } else if (locked.length > 0) {
      nextAchievement.textContent = locked[0].title;
    } else if (items.length > 0) {
      nextAchievement.textContent = "Wszystkie osiagniecia odblokowane.";
    } else {
      nextAchievement.textContent = "Brak osiagniec. Dodaj pierwsze.";
    }
  }

  if (listItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "planner-empty";
    empty.textContent = "Brak osiagniec.";
    achievementList.appendChild(empty);
    return;
  }

  listItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "achievement-item";
    li.style.animationDelay = `${index * 70}ms`;

    const left = document.createElement("div");
    left.className = "achievement-left";

    const title = document.createElement("strong");
    title.textContent = item.title;

    const desc = document.createElement("p");
    desc.className = "achievement-desc";
    desc.textContent = item.desc || "";

    left.appendChild(title);
    if (item.desc) left.appendChild(desc);

    const right = document.createElement("div");
    right.className = "achievement-right";

    const rarity = document.createElement("span");
    rarity.className = "achievement-rarity";
    rarity.textContent = item.rarity || "POSPOLITE";

    const status = document.createElement("span");
    status.className = item.unlocked
      ? "achievement-status achievement-status--unlocked"
      : "achievement-status achievement-status--locked";
    if (item.unlocked) {
      status.textContent = `Odblokowane | +${item.exp || 0} EXP`;
    } else if (item.progress) {
      status.textContent = item.progress;
    } else {
      status.textContent = "NIEODBLOCKOWANE";
    }

    right.appendChild(rarity);
    right.appendChild(status);

    li.appendChild(left);
    li.appendChild(right);
    achievementList.appendChild(li);
  });
};

renderAchievements();
seedAchievementsFromFile().then(() => {
  updateAchievementsFromStats();
  renderAchievements();
  renderCommunityList();
});

const earningsMonthGross = document.getElementById("earningsMonthGross");
const earningsMonthNet = document.getElementById("earningsMonthNet");
const earningsYearGross = document.getElementById("earningsYearGross");
const earningsYearNet = document.getElementById("earningsYearNet");
const earningsRateBadge = document.getElementById("earningsRateBadge");
const accountUnder26Toggle = document.getElementById("accountUnder26Toggle");
const earningsUnder26Toggle = document.getElementById("earningsUnder26Toggle");
const earningsRateModal = document.getElementById("earningsRateModal");
const earningsRateInput = document.getElementById("earningsRateInput");
const earningsRateSaveBtn = document.getElementById("earningsRateSaveBtn");
const earningsRateCancelBtn = document.getElementById("earningsRateCancelBtn");
const earningsRateCloseBtn = document.getElementById("earningsRateCloseBtn");
const earningsRateError = document.getElementById("earningsRateError");

const earningsConfigUrl = "./earnings-config.json";
const earningsConfigFallback = {
  defaultRate: 30,
  netFactor: 0.88,
  netFactorUnder26: 1,
  currency: "PLN",
  rateLabelSuffix: "PLN/h brutto",
};
let earningsConfig = { ...earningsConfigFallback };

const applyEarningsConfig = (config) => {
  if (!config || typeof config !== "object") return;
  earningsConfig = { ...earningsConfigFallback, ...config };
};

const loadEarningsConfig = async () => {
  try {
    const res = await fetch(earningsConfigUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed");
    const data = await res.json();
    applyEarningsConfig(data);
  } catch {
    applyEarningsConfig(earningsConfigFallback);
  }
};

const earningsRateKey = "earnings.rate.pln";
const earningsUnder26Key = "earnings.under26";

const getRate = () => {
  const raw = storage.getItem(earningsRateKey);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? value : Number(earningsConfig.defaultRate) || 30;
};

const getUnder26 = () => {
  const raw = storage.getItem(earningsUnder26Key);
  return raw === "true";
};

const setUnder26 = (value) => {
  storage.setItem(earningsUnder26Key, value ? "true" : "false");
};

const getNetFactor = () =>
  getUnder26()
    ? Number(earningsConfig.netFactorUnder26) || 1
    : Number(earningsConfig.netFactor) || 0.88;

const formatPLN = (value) => {
  const code = earningsConfig.currency || "PLN";
  return `${value.toFixed(2)} ${code}`;
};

const getEntriesSafe = () => {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const computeEarnings = () => {
  if (
    !earningsMonthGross ||
    !earningsMonthNet ||
    !earningsYearGross ||
    !earningsYearNet ||
    !earningsRateBadge
  ) {
    return;
  }

  const rate = getRate();
  const netFactor = getNetFactor();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthPrefix = `${year}-${month}`;

  const entries = loadEntriesSafe().filter(isWorkEntry);
  const monthHours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const yearHours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(`${year}-`))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

  const monthGross = monthHours * rate;
  const yearGross = yearHours * rate;
  const monthNet = monthGross * netFactor;
  const yearNet = yearGross * netFactor;

  earningsMonthGross.textContent = formatPLN(monthGross);
  earningsYearGross.textContent = formatPLN(yearGross);
  earningsMonthNet.textContent = formatPLN(monthNet);
  earningsYearNet.textContent = formatPLN(yearNet);
  const suffix = earningsConfig.rateLabelSuffix || "PLN/h brutto";
  earningsRateBadge.textContent = `${rate.toFixed(2)} ${suffix}`;
};

if (earningsRateBadge) {
  earningsRateBadge.addEventListener("click", () => {
    if (!earningsRateModal || !earningsRateInput) return;
    if (earningsRateError) earningsRateError.hidden = true;
    const current = getRate();
    earningsRateInput.value = current.toFixed(2);
    earningsRateModal.hidden = false;
    setTimeout(() => {
      earningsRateInput.focus();
      earningsRateInput.select();
    }, 0);
  });
}

const closeEarningsRateModal = () => {
  if (earningsRateModal) earningsRateModal.hidden = true;
};

const saveEarningsRate = () => {
  if (!earningsRateInput) return;
  const value = Number(String(earningsRateInput.value).replace(",", ".").trim());
  if (!Number.isFinite(value) || value <= 0) {
    if (earningsRateError) earningsRateError.hidden = false;
    earningsRateInput.setAttribute("aria-invalid", "true");
    return;
  }
  earningsRateInput.removeAttribute("aria-invalid");
  if (earningsRateError) earningsRateError.hidden = true;
  storage.setItem(earningsRateKey, String(value));
  computeEarnings();
  updateEarningsForecast();
  closeEarningsRateModal();
};

if (earningsRateSaveBtn) {
  earningsRateSaveBtn.addEventListener("click", saveEarningsRate);
}

if (earningsRateCancelBtn) {
  earningsRateCancelBtn.addEventListener("click", closeEarningsRateModal);
}

if (earningsRateCloseBtn) {
  earningsRateCloseBtn.addEventListener("click", closeEarningsRateModal);
}

if (earningsRateInput) {
  earningsRateInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEarningsRate();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeEarningsRateModal();
    }
  });
}

if (earningsRateModal) {
  earningsRateModal.addEventListener("click", (event) => {
    if (event.target === earningsRateModal) {
      closeEarningsRateModal();
    }
  });
}

if (accountUnder26Toggle) {
  accountUnder26Toggle.checked = getUnder26();
  accountUnder26Toggle.addEventListener("change", () => {
    setUnder26(accountUnder26Toggle.checked);
    if (earningsUnder26Toggle) {
      earningsUnder26Toggle.checked = accountUnder26Toggle.checked;
    }
    computeEarnings();
    updateEarningsForecast();
  });
}

if (earningsUnder26Toggle) {
  earningsUnder26Toggle.checked = getUnder26();
  earningsUnder26Toggle.addEventListener("change", () => {
    setUnder26(earningsUnder26Toggle.checked);
    if (accountUnder26Toggle) {
      accountUnder26Toggle.checked = earningsUnder26Toggle.checked;
    }
    computeEarnings();
    updateEarningsForecast();
  });
}

computeEarnings();

const earningsMonthPicker = document.getElementById("earningsMonthPicker");
const earningsSelectedGross = document.getElementById("earningsSelectedGross");
const earningsSelectedNet = document.getElementById("earningsSelectedNet");
const earningsSelectedMonthLabel = document.getElementById("earningsSelectedMonthLabel");

const renderSelectedMonthEarnings = () => {
  if (
    !earningsMonthPicker ||
    !earningsSelectedGross ||
    !earningsSelectedNet ||
    !earningsSelectedMonthLabel
  ) {
    return;
  }

  const rate = getRate();
  const netFactor = getNetFactor();
  const value = earningsMonthPicker.value;
  const now = new Date();
  if (!value) {
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    earningsMonthPicker.value = current;
  }

  const [year, month] = earningsMonthPicker.value.split("-");
  const monthNames = [
    "styczeĹ„",
    "luty",
    "marzec",
    "kwiecieĹ„",
    "maj",
    "czerwiec",
    "lipiec",
    "sierpieĹ„",
    "wrzesieĹ„",
    "paĹşdziernik",
    "listopad",
    "grudzieĹ„",
  ];
  const monthIndex = Number(month) - 1;
  earningsSelectedMonthLabel.textContent = `${monthNames[monthIndex]} ${year} (brutto)`;

  const entries = loadEntriesSafe().filter(isWorkEntry);
  const monthPrefix = `${year}-${month}`;
  const hours = entries
    .filter((e) => typeof e.date === "string" && e.date.startsWith(monthPrefix))
    .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const gross = hours * rate;
  const net = gross * netFactor;

  const code = earningsConfig.currency || "PLN";
  earningsSelectedGross.textContent = `${gross.toFixed(2)} ${code}`;
  earningsSelectedNet.textContent = `${net.toFixed(2)} ${code}`;
};

if (earningsMonthPicker) {
  earningsMonthPicker.addEventListener("change", () => {
    renderSelectedMonthEarnings();
  });
}

renderSelectedMonthEarnings();

loadEarningsConfig().then(() => {
  computeEarnings();
  renderSelectedMonthEarnings();
});

const navUserLevel = document.getElementById("navUserLevel");
const navUserRank = document.getElementById("navUserRank");
const navLevelProgressBar = document.getElementById("navLevelProgressBar");
const currentRankName = document.getElementById("currentRankName");
const rankProgressFill = document.getElementById("rankProgressFill");
const rankMetaText = document.getElementById("rankMetaText");
const rankNextText = document.getElementById("rankNextText");
const rankSteps = Array.from(document.querySelectorAll(".rank-step"));

const expPerHour = 7;
const fullDayBonus = 10;
const weekendBonusFactor = 1.18;
const streakBonusFactor = 1.03;
const maxLevel = 100;
const expCurve = {
  base: 240,
  earlyExponent: 1.4,
  earlyScale: 40,
  lateExponent: 1.75,
  lateScale: 50,
  lateStart: 10,
  lateBonus: 200,
  lateStep: 16,
};

const expForLevel = (level) => {
  if (level <= expCurve.lateStart) {
    return Math.round(expCurve.base + Math.pow(level, expCurve.earlyExponent) * expCurve.earlyScale);
  }
  const lateCurve =
    Math.pow(level, expCurve.lateExponent) * expCurve.lateScale +
    expCurve.lateBonus +
    (level - expCurve.lateStart) * expCurve.lateStep;
  return Math.round(expCurve.base + lateCurve);
};

const computeTotalExpForEntries = (entries) => {
  const byDate = new Map();
  entries.forEach((e) => {
    if (!isWorkEntry(e) || typeof e.date !== "string") return;
    const hours = Number(e.hours) || 0;
    if (hours <= 0) return;
    byDate.set(e.date, (byDate.get(e.date) || 0) + hours);
  });

  const days = Array.from(byDate.entries())
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let totalExp = 0;
  let streak = 0;
  let prevDate = null;

  days.forEach((day) => {
    const dateObj = new Date(day.date);
    const base = day.hours * expPerHour + (day.hours >= 8 ? fullDayBonus : 0);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    let exp = isWeekend ? base * weekendBonusFactor : base;

    if (prevDate) {
      const prev = new Date(prevDate);
      prev.setDate(prev.getDate() + 1);
      if (prev.toISOString().slice(0, 10) === day.date) {
        streak += 1;
      } else {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    if (streak >= 3) {
      exp *= streakBonusFactor;
    }

    totalExp += exp;
    prevDate = day.date;
  });

  return Math.round(totalExp);
};

const computeTotalExp = () => {
  return computeTotalExpForEntries(getEntriesSafe());
};

const totalExpFromLevel = (level, progress = 0) => {
  const safeLevel = Math.max(1, Math.min(maxLevel, Math.floor(Number(level) || 1)));
  const safeProgress = clampNumber(Number(progress) || 0, 0, 1);
  let total = 0;
  for (let l = 1; l < safeLevel; l += 1) {
    total += expForLevel(l);
  }
  total += expForLevel(safeLevel) * safeProgress;
  return Math.round(total);
};

const getEffectiveTotalExp = () => {
  if (isDevModeEnabled && devLevelOverride && Number.isFinite(devLevelOverride.level)) {
    return totalExpFromLevel(devLevelOverride.level, devLevelOverride.progress || 0);
  }
  return computeTotalExp();
};

const computeLevelingFromExp = (totalExp) => {
  let expPool = totalExp;
  let level = 1;
  let guard = 0;
  while (level < maxLevel && expPool >= expForLevel(level) && guard < 1000) {
    expPool -= expForLevel(level);
    level += 1;
    guard += 1;
  }
  if (level >= maxLevel) {
    return { level: maxLevel, progress: 1 };
  }
  const progress = expPool / expForLevel(level);
  return { level, progress };
};

const computeLeveling = () => {
  return computeLevelingFromExp(getEffectiveTotalExp());
};

const getRankInfo = (level) => {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const band = rankBands.find((b) => safeLevel >= b.min && safeLevel <= b.max) || rankBands[rankBands.length - 1];
  const rankSize = Math.max(1, Number(band.max) - Number(band.min) + 1);
  const rankLevel = Math.min(Math.max(safeLevel - band.min + 1, 1), rankSize);
  const rankName = `${band.name} ${rankLevel}`;
  return { band, rankSize, rankLevel, rankName };
};

const rankConfigUrl = "./rank-config.json";

const rankConfigFallback = {
  tiersPerRank: 3,
  rankBands: [
    { name: "Bronze", min: 1, max: 3 },
    { name: "Silver", min: 4, max: 6 },
    { name: "Gold", min: 7, max: 9 },
    { name: "Platinum", min: 10, max: 12 },
    { name: "Diamond", min: 13, max: 15 },
    { name: "Mythic", min: 16, max: 18 },
    { name: "Ascended", min: 19, max: 21 },
    { name: "Eternal", min: 22, max: 24 },
  ],
  rankTiers: ["1", "2", "3"],
  rankVisuals: {
    Bronze: { accent: "#c79364", soft: "#7a4a22", rgb: "199,147,100" },
    Silver: { accent: "#b6c0c9", soft: "#6b7680", rgb: "182,192,201" },
    Gold: { accent: "#e7c368", soft: "#a3792b", rgb: "231,195,104" },
    Platinum: { accent: "#8cd4e6", soft: "#356d7b", rgb: "140,212,230" },
    Diamond: { accent: "#6cb0ff", soft: "#2a4f8a", rgb: "108,176,255" },
    Mythic: { accent: "#b86cff", soft: "#5b238e", rgb: "184,108,255" },
    Ascended: { accent: "#68ffd2", soft: "#1e8064", rgb: "104,255,210" },
    Eternal: { accent: "#ff7a7a", soft: "#7b2626", rgb: "255,122,122" },
  },
  rareRanks: ["Diamond", "Mythic", "Ascended", "Eternal"],
};

let tiersPerRank = rankConfigFallback.tiersPerRank;
let rankBands = rankConfigFallback.rankBands;
let rankTiers = rankConfigFallback.rankTiers;
let rankVisuals = rankConfigFallback.rankVisuals;
let rareRanks = new Set(rankConfigFallback.rareRanks);

const applyRankConfig = (config) => {
  if (!config || typeof config !== "object") return;
  if (Number.isFinite(Number(config.tiersPerRank))) {
    tiersPerRank = Number(config.tiersPerRank);
  }
  if (Array.isArray(config.rankBands) && config.rankBands.length) {
    rankBands = config.rankBands;
  }
  if (Array.isArray(config.rankTiers) && config.rankTiers.length) {
    rankTiers = config.rankTiers.map((tier) => String(tier));
  }
  if (config.rankVisuals && typeof config.rankVisuals === "object") {
    rankVisuals = config.rankVisuals;
  }
  if (Array.isArray(config.rareRanks)) {
    rareRanks = new Set(config.rareRanks.map((name) => String(name)));
  }
};

const loadRankConfig = async () => {
  try {
    const response = await fetch(rankConfigUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Fetch failed");
    const data = await response.json();
    applyRankConfig(data);
  } catch {
    applyRankConfig(rankConfigFallback);
  }
};

const setRankVisuals = (bandName) => {
  const visuals = rankVisuals[bandName] || rankVisuals.Bronze;
  const rankBox = document.getElementById("rankBox");
  if (rankBox) {
    rankBox.style.setProperty("--rank-accent", visuals.accent);
    rankBox.style.setProperty("--rank-accent-soft", visuals.soft);
    rankBox.style.setProperty("--rank-rgb", visuals.rgb);
    rankBox.classList.toggle("rank-is-rare", rareRanks.has(bandName));
  }
  rankBadges.forEach((badge) => {
    badge.setAttribute("data-rank", bandName);
    badge.style.setProperty("--rank-rgb", visuals.rgb);
  });
  if (mainProfileAvatar) {
    mainProfileAvatar.style.setProperty("--rank-rgb", visuals.rgb);
    mainProfileAvatar.classList.toggle("rank-is-rare", rareRanks.has(bandName));
  }
  if (mainProfileRankText) {
    mainProfileRankText.style.setProperty("--rank-accent", visuals.accent);
    mainProfileRankText.style.setProperty("--rank-accent-soft", visuals.soft);
    mainProfileRankText.style.setProperty("--rank-rgb", visuals.rgb);
  }
};

const updateRankUI = () => {
  const totalExp = getEffectiveTotalExp();
  const { level, progress } = computeLevelingFromExp(totalExp);

  const { band, rankSize, rankLevel, rankName } = getRankInfo(level);
  const nextBand = rankBands[rankBands.indexOf(band) + 1];
  const rankPercent = Math.max(0, Math.min(100, Math.round(((rankLevel - 1 + progress) / rankSize) * 100)));

  if (navUserLevel) navUserLevel.textContent = `Poziom ${level}`;
  if (navUserRank) navUserRank.textContent = rankName;
  if (navLevelProgressBar) navLevelProgressBar.style.width = `${Math.round(progress * 100)}%`;
  if (mainProfileRankText) mainProfileRankText.textContent = rankName;

  if (currentRankName) currentRankName.textContent = rankName;
  if (rankProgressFill) rankProgressFill.style.width = `${rankPercent}%`;
  if (rankMetaText) {
    rankMetaText.textContent = `Poziom rangi: ${rankLevel}/${rankSize} | Segment ${rankLevel} | ${rankPercent}%`;
  }
  if (rankNextText) {
    rankNextText.textContent = nextBand
      ? `następna: ${nextBand.name} | lvl ${nextBand.min}`
      : "następna: —";
  }

  rankSteps.forEach((step) => {
    step.classList.toggle("is-active", step.dataset.rank === band.name);
  });

  setRankVisuals(band.name);

  const previous = loadRankState();
  if (!rankToastSuppressed && previous && previous.rankName !== rankName) {
    showRankToast(rankName, level);
    playRankUpSound();
    fireConfetti();
    const rankBox = document.getElementById("rankBox");
    if (rankBox) {
      rankBox.classList.remove("rank-levelup");
      void rankBox.offsetWidth;
      rankBox.classList.add("rank-levelup");
      window.clearTimeout(rankBox._levelTimer);
      rankBox._levelTimer = window.setTimeout(() => {
        rankBox.classList.remove("rank-levelup");
      }, 1600);
    }
  }
  saveRankState({ rankName, level, band: band.name, tier: rankLevel });
};

suppressRankToast(2500);
initSupabase();
updateRankUI();
refreshAll();
cleanupStrayTextNodes();
loadRankConfig().then(() => {
  updateRankUI();
  renderCommunityList();
});

loadCommunityConfig().then(() => {
  purgeCommunityDemoData();
  renderCommunityOverview();
  renderCommunityList();
});

