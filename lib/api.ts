import {
    AppUser,
    Course,
    CourseItem,
    FeedbackImageItem,
    HomeCategoryGroup,
    HomeTopMediaItem,
    MyCourseItem,
    Session
} from "@/types/backend";
import { clearAuthSession, getAuthToken, getCurrentUser, setAuthSession } from "./authStore";
import { loadCachedOrFetch } from "./offlineCache";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
const DAILY_CACHE_MS = 24 * 60 * 60 * 1000;

function normalizeMediaType(fileType: unknown, mediaUrl?: string): "audio" | "video" {
  const value = String(fileType || "").toLowerCase();
  const cleanUrl = String(mediaUrl || "").toLowerCase().split("?")[0] ?? "";

  if (
    value.includes("audio") ||
    /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/.test(cleanUrl)
  ) {
    return "audio";
  }

  return "video";
}

function toNumberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isFreeValue(value: unknown) {
  return String(value || "").trim().toLowerCase() === "free";
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${cleanPath}`;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "Request failed";
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.msg || errorJson.error || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

function withCacheBuster(path: string, enabled: boolean) {
  if (!enabled) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_=${Date.now()}`;
}

// --- AUTH FUNCTIONS ---

export async function loginWithApi(identifier: string, password: string): Promise<AppUser> {
  const formData = new FormData();
  formData.append("identifier", identifier);
  formData.append("password", password);

  const response = await request<{ status: string; user: any; token?: string; msg?: string }>(
    "/accounts/app_login/",
    {
      method: "POST",
      body: formData,
    }
  );

  if (response.status !== "success") {
    throw new Error(response.msg || "Login failed");
  }

  const user: AppUser = {
    uid: String(response.user.user_id),
    email: response.user.email,
    fullName: response.user.full_name,
    phone: response.user.phone,
    isStaff: response.user.is_staff,
  };

  await setAuthSession(user, response.token || "session-token");
  return user;
}

export async function registerWithApi(params: any): Promise<AppUser> {
  const formData = new FormData();
  formData.append("full_name", params.fullName);
  formData.append("email", params.email);
  formData.append("phone", params.phone);
  formData.append("password", params.password);
  if (params.address) formData.append("address", params.address);

  const response = await request<{ status: string; user: any; token?: string; msg?: string }>(
    "/accounts/app_register/",
    {
      method: "POST",
      body: formData,
    }
  );

  if (response.status !== "success") {
    throw new Error(response.msg || "Registration failed");
  }

  const user: AppUser = {
    uid: String(response.user.user_id),
    email: response.user.email,
    fullName: response.user.full_name,
    phone: response.user.phone,
    isStaff: response.user.is_staff,
  };

  await setAuthSession(user, response.token || "session-token");
  return user;
}

export async function logoutWithApi() {
  await request("/accounts/app_logout/", { method: "POST" }).catch(() => {});
  await clearAuthSession();
}

export async function getAccountOverview() {
  const user = getCurrentUser();
  const response = await request<{ status: string; user: any }>("/accounts/app_me/");
  
  const mappedUser: AppUser = {
    uid: String(response.user.user_id),
    email: response.user.email,
    fullName: response.user.full_name,
    phone: response.user.phone,
    isStaff: response.user.is_staff,
  };

  const myCourses = await listMyCourses().catch(() => []);

  return {
    user: mappedUser,
    myCourses,
    purchases: [] // Purchases array is derived from myCourses in this setup
  };
}

export async function changePasswordWithApi(current: string, next: string) {
  const formData = new FormData();
  formData.append("current_password", current);
  formData.append("new_password", next);

  return request<{ status: string; msg: string }>("/accounts/app_change_password/", {
    method: "POST",
    body: formData,
  });
}

// --- FORGOT PASSWORD ---

export async function sendForgotPasswordOtpWithApi(phone: string) {
  const formData = new FormData();
  formData.append("phone", phone);
  return request<{ status: string; msg: string }>("/accounts/app_forgot_password_send_otp/", {
    method: "POST",
    body: formData,
  });
}

export async function resetPasswordWithOtpApi(params: any) {
  const formData = new FormData();
  formData.append("phone", params.phone);
  formData.append("otp", params.otp);
  formData.append("new_password", params.newPassword);
  
  return request<{ status: string; msg: string }>("/accounts/app_forgot_password_reset/", {
    method: "POST",
    body: formData,
  });
}

// --- HOME & CATEGORY FUNCTIONS ---

export async function listHomeCategories(forceRefresh = false): Promise<HomeCategoryGroup[]> {
  return loadCachedOrFetch("home-categories", async () => {
    const response = await request<{ categories?: any[]; data?: { categories?: any[] } }>("/courses/home_catalog1/");
    const categories = response.categories || response.data?.categories || [];
    return categories.map(cat => ({
      id: String(cat.category_id),
      name: cat.category_name,
      courses: (cat.courses || []).map((c: any) => ({
        id: String(c.id),
        courseName: c.course_name,
        imageUrl: c.image,
        rating: c.rating != null ? Number(c.rating) : undefined,
        sortOrder: c.screen_order !== null && c.screen_order !== "" ? Number(c.screen_order) : undefined,
      } as Course)).sort((a: Course, b: Course) => ((a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)))
    }));
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function listHomeTopMedia(forceRefresh = false): Promise<HomeTopMediaItem[]> {
  return loadCachedOrFetch("home-top-media", async () => {
    const response = await request<{ status: string; data: any[] }>("/app_home_top_media/");
    return (response.data || []).map(item => ({
      id: String(item.id),
      url: item.url,
      courseId: String(item.course_id),
      courseName: item.course_name,
      courseImageUrl: item.course_image,
      sortOrder: item.sort_order,
    }));
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function listMyCourses(forceRefresh = false): Promise<MyCourseItem[]> {
  const user = getCurrentUser();
  if (!user?.uid) return [];

  return loadCachedOrFetch(`my-courses:${user.uid}`, async () => {
    const response = await request<{ my_course: any[] }>(`/courses/my_courses/?user_id=${user.uid}`);
    return (response.my_course || []).map(c => ({
      id: String(c.id ?? c.course_id),
      categoryId: c.category_id != null ? String(c.category_id) : undefined,
      categoryName: c.category_name ?? c.categoryName,
      courseName: c.name ?? c.course_name ?? c.courseName,
      subCourseName: c.sub_course_name ?? c.subCourseName,
      instructor: c.instructor,
      description: c.description,
      imageUrl: c.course_image ?? c.image ?? c.imageUrl,
      demoVideoUrl: c.demo_video ?? c.demoVideoUrl,
      language: c.course_lang ?? c.language,
      contentType: c.type ?? c.contentType,
      paymentStatus: c.payment_status ?? c.paymentStatus,
      totalSessions: c.total_sessions != null ? Number(c.total_sessions) : c.totalSessions != null ? Number(c.totalSessions) : undefined,
      completedSessions: c.completed_sessions != null ? Number(c.completed_sessions) : c.completedSessions != null ? Number(c.completedSessions) : undefined,
      sessionProgress: c.session_progress ?? c.sessionProgress,
      enrolledAt: c.enrolled_at ?? c.enrolledAt ?? c.start_date,
    }));
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function getCourse(id: string, forceRefresh = false): Promise<Course> {
  return loadCachedOrFetch(`course:${id}`, async () => {
    const response = await request<any>(`/courses/course_full_detail/?course_id=${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    const price = toNumberOrUndefined(
      response.price ?? response.money ?? response.amount ?? response.course_price ?? response.service_price
    );
    const freeText =
      isFreeValue(response.price) ||
      isFreeValue(response.money) ||
      isFreeValue(response.amount) ||
      isFreeValue(response.course_price) ||
      isFreeValue(response.payment_status) ||
      isFreeValue(response.paymentStatus);
    const explicitPaid =
      response.is_paid ?? response.isPaid ?? response.paid ?? response.is_course_paid;

    return {
      id: String(response.id),
      categoryId: String(response.category_id),
      categoryName: response.category_name,
      courseName: response.course_name,
      instructor: response.instructor,
      description: response.description,
      imageUrl: response.image,
      demoVideoUrl: response.demo_video,
      language: response.language,
      contentType: response.type,
      validateFor: response.validate_for,
      price,
      priceMonth: toNumberOrUndefined(response.price_month ?? response.month),
      isPaid:
        typeof explicitPaid === "boolean"
          ? explicitPaid
          : freeText
            ? false
            : price !== undefined
              ? price > 0
              : true,
    };
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function listCourseSessions(courseId: string, forceRefresh = false): Promise<Session[]> {
  return loadCachedOrFetch(`course-sessions:${courseId}`, async () => {
    const response = await request<{ course_details: any[] }>(`/courses/course_detail/?course_id=${courseId}`);
    return (response.course_details || []).map((session, index) => {
      const mediaUrl = session.video ?? session.audio ?? session.file ?? session.url ?? "";
      return {
        id: String(session.id ?? session.video_id ?? session.videofile_id ?? index + 1),
        courseId,
        title: session.title,
        mediaType: normalizeMediaType(session.file_type ?? session.type ?? session.media_type, mediaUrl),
        audioUrl: mediaUrl,
        duration: Number(session.duration ?? session.video_duration ?? 600) || 600,
        order: Number(session.screen_order ?? session.order ?? index + 1),
        isActive: session.is_active !== false,
      };
    });
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function updateSessionProgress(params: {
  courseId: string;
  sessionId: string;
  position: number;
  completed: boolean;
}) {
  return request("/app_update_session_progress/", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// --- FEEDBACK FUNCTIONS ---

export async function listFeedbackImages(forceRefresh = false): Promise<FeedbackImageItem[]> {
  return loadCachedOrFetch("feedback-images", async () => {
    const response = await request<{
      status?: string;
      data?: any[] | { data?: any[]; images?: any[] };
      feedback_images?: any[];
      images?: any[];
    }>(withCacheBuster("/app_get_feedback_images/", forceRefresh));
    const data = Array.isArray(response.data)
      ? response.data
      : response.data?.data || response.data?.images || response.feedback_images || response.images || [];

    return data.map(img => ({
      id: String(img.id),
      title: img.title,
      imageUrl: img.image_url || img.imageUrl || img.image,
      createdAt: img.created_at || img.createdAt || "",
    }));
  }, DAILY_CACHE_MS, forceRefresh);
}

export async function uploadFeedbackImage(title: string, uri: string) {
  const formData = new FormData();
  formData.append("title", title);
  if (uri) {
    const filename = uri.split("/").pop() || "image.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";
    formData.append("image", ({ uri, name: filename, type } as any));
  }
  return request("/app_upload_feedback_image/", {
    method: "POST",
    body: formData,
  });
}

export async function deleteFeedbackImage(id: string) {
  const formData = new FormData();
  formData.append("id", id);
  return request("/app_delete_feedback_image/", {
    method: "POST",
    body: formData,
  });
}

export async function editFeedbackImage(params: { id: string; title?: string; uri?: string }) {
  const formData = new FormData();
  formData.append("id", params.id);
  if (params.title) formData.append("title", params.title);
  if (params.uri) {
    const filename = params.uri.split("/").pop() || "image.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";
    formData.append("image", ({ uri: params.uri, name: filename, type } as any));
  }
  return request("/app_edit_feedback_image/", {
    method: "POST",
    body: formData,
  });
}

// --- ADMIN & COURSE MASTER ---

export async function listCourses(): Promise<CourseItem[]> {
  const response = await request<{ status?: string; data?: any[]; course_list?: any[]; courses?: any[] }>("/app_get_courses/");
  const rows = response.data || response.course_list || response.courses || [];
  return rows.map(c => ({
    id: String(c.id),
    name: c.name,
    screen_order: Number(c.screen_order ?? 0),
    rating: Number(c.rating ?? 0)
  }));
}

export async function updateCourseDetailsBulk(items: any[]) {
  const normalizedItems = items.map((item) => ({
    id: String(item.id),
    screen_order: Number.isFinite(Number(item.screen_order)) ? Number(item.screen_order) : 0,
    rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : 0,
  }));

  const result = await request("/update_master_bulk/", {
    method: "POST",
    body: JSON.stringify({ items: normalizedItems, courses: normalizedItems }),
  });

  await listHomeCategories(true).catch(() => []);
  return result;
}
