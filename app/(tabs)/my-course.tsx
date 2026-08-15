import { Image as ExpoImage } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCourse,
  listCourseSessions,
  listFeedbackImages,
  listHomeCategories,
  listHomeTopMedia,
  listMyCourses,
} from "../../lib/api";
import { getCourseProgress } from "../../lib/progressStore";
import { useAuthUser } from "../../lib/useAuth";
import { MyCourseItem } from "../../types/backend";

type MyCourseWithProgress = MyCourseItem & {
  progressPercent: number;
  progressCountText: string;
};

export default function MyCourseScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const uid = user?.uid ?? null;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [courses, setCourses] = useState<MyCourseWithProgress[]>([]);

  const loadMyCourses = useCallback(async (forceRefresh = false) => {
    if (authLoading) return;

    if (!uid) {
      setCourses([]);
      setLoading(false);
      return;
    }

    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      if (forceRefresh) {
        await Promise.allSettled([
          listHomeCategories(true),
          listHomeTopMedia(true),
          listFeedbackImages(true),
        ]);
      }

      const enrolledCourses = await listMyCourses(forceRefresh);
      const coursesWithLocalProgress = await Promise.all(
        enrolledCourses.map(async (course) => {
          const [localProgress, sessions] = await Promise.all([
            getCourseProgress(course.id, uid),
            forceRefresh ? getCourse(course.id, true).catch(() => null) : Promise.resolve(null),
            listCourseSessions(course.id, forceRefresh).catch(() => []),
          ]).then(([progress, _courseDetails, sessionRows]) => [progress, sessionRows] as const);
          const progressValues = Object.values(localProgress);
          const localCompleted = progressValues.filter((progress) => progress.completed).length;
          const totalSessions = course.totalSessions || sessions.length || progressValues.length;
          const completedSessions = Math.max(course.completedSessions || 0, localCompleted);
          const totalCourseDuration = sessions.reduce((total, session) => {
            const progress = localProgress[session.id];
            return total + (progress?.totalDuration || session.duration || 0);
          }, 0);
          const watchedDuration = sessions.reduce((total, session) => {
            const progress = localProgress[session.id];
            if (!progress) return total;

            const totalDuration = progress.totalDuration || session.duration || 0;
            if (progress.completed && totalDuration > 0) {
              return total + totalDuration;
            }

            return total + Math.min(progress.lastPosition || 0, totalDuration || progress.lastPosition || 0);
          }, 0);
          const progressPercent = totalCourseDuration > 0
            ? Math.min(Math.round((watchedDuration / totalCourseDuration) * 100), 100)
            : totalSessions > 0
              ? Math.min(Math.round((completedSessions / totalSessions) * 100), 100)
              : 0;

          return {
            ...course,
            completedSessions,
            totalSessions,
            progressPercent,
            progressCountText: totalSessions > 0 ? `${completedSessions}/${totalSessions}` : "",
            sessionProgress: {
              ...(course.sessionProgress || {}),
              ...localProgress,
            },
          };
        })
      );
      setCourses(coursesWithLocalProgress);
    } catch (error) {
      console.log("Load my courses error:", error);
      if (forceRefresh) {
        Alert.alert("Refresh failed", "Unable to refresh from server right now. Showing saved data if available.");
      } else {
        setCourses([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, uid]);

  useEffect(() => {
    if (authLoading) return;

    if (!uid) {
      router.push({
        pathname: "/login",
        params: { redirect: "/(tabs)/my-course" },
      });
    }
  }, [authLoading, router, uid]);

  useFocusEffect(
    useCallback(() => {
      void loadMyCourses();
    }, [loadMyCourses])
  );

  const openCourse = useCallback((courseId: string) => {
    router.push(`/course/${courseId}`);
  }, [router]);

  const handleManualRefresh = () => {
    void loadMyCourses(true);
  };

  const renderCourseCard = useCallback(({ item }: { item: MyCourseWithProgress }) => {
    return (
      <View style={styles.card}>
        <View style={styles.courseRow}>
          {item.imageUrl ? (
            <ExpoImage
              source={{ uri: item.imageUrl }}
              style={styles.courseImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={[styles.courseImage, styles.imagePlaceholder]}>
              <Text style={styles.imagePlaceholderText}>IMG</Text>
            </View>
          )}

          <View style={styles.cardTextWrap}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.courseName || "Untitled Course"}
              </Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {item.paymentStatus?.toUpperCase() || "ENROLLED"}
                </Text>
              </View>
            </View>
            {!!item.subCourseName && (
              <Text style={styles.cardSubTitle}>{item.subCourseName}</Text>
            )}
            {!!item.categoryName && (
              <Text style={styles.cardCategory}>{item.categoryName}</Text>
            )}
            {!!item.enrolledAt && (
              <Text style={styles.enrolledAtText}>
                Added: {String(item.enrolledAt).split("T")[0]}
              </Text>
            )}
            {item.totalSessions ? (
              <View style={styles.progressWrap}>
                <View style={styles.progressTopRow}>
                  <Text style={styles.progressLabel}>{item.progressPercent}% complete</Text>
                  <Text style={styles.progressCount}>{item.progressCountText}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${item.progressPercent}%` }]} />
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable style={styles.openButton} onPress={() => openCourse(item.id)}>
          <Text style={styles.openButtonText}>Open Course</Text>
        </Pressable>
      </View>
    );
  }, [openCourse]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading your courses...</Text>
      </SafeAreaView>
    );
  }

  if (!uid) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <Text style={styles.emptyTitle}>Sign in to see your courses</Text>
        <Pressable
          style={styles.openButton}
          onPress={() =>
            router.push({
              pathname: "/login",
              params: { redirect: "/(tabs)/my-course" },
            })
          }
        >
          <Text style={styles.openButtonText}>Go to Login</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.heading}>My Course</Text>
          <Text style={styles.subheading}>All enrolled courses will appear here</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh all app data from server"
          accessibilityRole="button"
          disabled={refreshing}
          onPress={handleManualRefresh}
          style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text style={styles.refreshButtonText}>Refresh All</Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleManualRefresh}
        renderItem={renderCourseCard}
        removeClippedSubviews
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No courses enrolled yet</Text>
            <Text style={styles.emptyText}>Go to Home, open a course, and tap Enroll.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7fb", paddingHorizontal: 16, paddingTop: 8 },
  center: { flex: 1, backgroundColor: "#f5f7fb", justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#64748b", fontSize: 15 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerTextWrap: { flex: 1, minWidth: 0 },
  heading: { fontSize: 30, fontWeight: "800", color: "#0f172a", letterSpacing: -0.6 },
  subheading: { marginTop: 2, marginBottom: 18, fontSize: 10, lineHeight: 15, color: "#64748b" },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 88,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  refreshButtonDisabled: { opacity: 0.7 },
  refreshButtonText: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  listContent: { paddingBottom: 32 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e7edf5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  courseRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  courseImage: {
    width: 90,
    height: 90,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: {
    color: "#64748b",
    fontWeight: "800",
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, width: "100%" },
  cardTextWrap: { flex: 1, minWidth: 0 },
  cardTitle: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: "800", color: "#0f172a", lineHeight: 24, paddingRight: 4 },
  cardSubTitle: { marginTop: 5, fontSize: 13, fontWeight: "700", color: "#16a34a" },
  cardCategory: { marginTop: 6, fontSize: 13, color: "#64748b" },
  enrolledAtText: { marginTop: 6, fontSize: 12, color: "#94a3b8", fontWeight: "700" },
  progressWrap: { marginTop: 10 },
  progressTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  progressLabel: { color: "#0f172a", fontSize: 12, fontWeight: "800" },
  progressCount: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  progressTrack: { marginTop: 6, height: 7, borderRadius: 999, backgroundColor: "#e2e8f0", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#16a34a" },
  statusBadge: { flexShrink: 0, backgroundColor: "#eff6ff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 92 },
  statusText: { color: "#2563eb", fontSize: 11, fontWeight: "800" },
  openButton: { marginTop: 14, backgroundColor: "#0f172a", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  openButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  emptyWrap: { paddingVertical: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  emptyText: { marginTop: 8, fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20 },
});
