import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  loginWithApi,
  resetPasswordWithOtpApi,
  sendForgotPasswordOtpWithApi,
} from "../lib/api";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string | string[] }>();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetPhone, setResetPhone] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const redirectTarget = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;

  const resetForgotPasswordState = () => {
    setOtpSent(false);
    setResetPhone("");
    setResetOtp("");
    setResetPassword("");
  };

  const handleSendOtp = async () => {
    const normalizedPhone = resetPhone.replace(/\D/g, "").slice(-10);

    if (normalizedPhone.length !== 10) {
      Alert.alert("Invalid phone", "Please enter a valid 10-digit phone number.");
      return;
    }

    try {
      setResetLoading(true);
      const response = await sendForgotPasswordOtpWithApi(normalizedPhone);
      setResetPhone(normalizedPhone);
      setOtpSent(true);
      Alert.alert(
        "OTP sent",
        response.msg || `We sent an SMS OTP to ${normalizedPhone}.`
      );
    } catch (error) {
      console.log("Send OTP error:", error);
      Alert.alert("Unable to send OTP", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const normalizedPhone = resetPhone.replace(/\D/g, "").slice(-10);

    if (normalizedPhone.length !== 10 || resetOtp.trim().length !== 6 || !resetPassword.trim()) {
      Alert.alert("Missing fields", "Enter your phone number, OTP, and new password.");
      return;
    }

    if (resetPassword.trim().length < 6) {
      Alert.alert("Weak password", "New password must be at least 6 characters.");
      return;
    }

    try {
      setResetLoading(true);
      await resetPasswordWithOtpApi({
        phone: normalizedPhone,
        otp: resetOtp.trim(),
        newPassword: resetPassword.trim(),
      });
      setShowForgotPassword(false);
      resetForgotPasswordState();
      Alert.alert("Password updated", "Your password has been reset. You can log in now.");
    } catch (error) {
      console.log("Reset password error:", error);
      Alert.alert(
        "Reset failed",
        error instanceof Error ? error.message : "Please verify the OTP and try again."
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter email or phone and password.");
      return;
    }

    try {
      setLoading(true);
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const user = await loginWithApi(normalizedIdentifier, password);
      Alert.alert("Login successful", `Welcome ${user.fullName || user.email || "User"}`);
      if (redirectTarget) {
        router.replace(redirectTarget as any);
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch (error) {
      console.log("Login error:", error);
      Alert.alert(
        "Login failed",
        "Please check your email and password and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={() => router.canGoBack() && router.back()} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.topSection}>
          <View style={styles.card}>
            <View style={styles.cardGlow} />
            <View style={styles.heroBand}>
              <View style={styles.heroBadgeRow}>
                <Text style={styles.badge}>MRC Therapy</Text>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>
                    {showForgotPassword ? "Password Recovery" : "Secure Sign In"}
                  </Text>
                </View>
              </View>

              <Text style={styles.title}>
                {showForgotPassword ? "Reset Password" : "Welcome Back"}
              </Text>
            </View>

            <View style={styles.cardHeader}>
              <View style={styles.headerSpacer} />
              {router.canGoBack() ? (
                <Pressable style={styles.closeButton} onPress={() => router.back()}>
                  <Text style={styles.closeButtonText}>X</Text>
                </Pressable>
              ) : null}
            </View>

            {showForgotPassword ? (
              <>
                <View style={styles.formSection}>
                  <Text style={styles.sectionEyebrow}>Password Recovery</Text>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 10-digit phone number"
                    placeholderTextColor="#94a3b8"
                    value={resetPhone}
                    onChangeText={(value) => setResetPhone(value.replace(/\D/g, "").slice(-10))}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />

                  {otpSent ? (
                    <>
                      <Text style={[styles.label, styles.spaced]}>OTP</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter 6-digit OTP"
                        placeholderTextColor="#94a3b8"
                        value={resetOtp}
                        onChangeText={(value) => setResetOtp(value.replace(/\D/g, "").slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                      />

                      <Text style={[styles.label, styles.spaced]}>New Password</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your new password"
                        placeholderTextColor="#94a3b8"
                        value={resetPassword}
                        onChangeText={setResetPassword}
                        secureTextEntry
                      />
                    </>
                  ) : null}
                </View>

                {otpSent ? (
                  <>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={handleResetPassword}
                      disabled={resetLoading}
                    >
                      <View style={styles.primaryButtonOverlay} />
                      {resetLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Update Password</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handleSendOtp}
                      disabled={resetLoading}
                    >
                      <Text style={styles.secondaryButtonText}>Resend OTP</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleSendOtp}
                    disabled={resetLoading}
                  >
                    <View style={styles.primaryButtonOverlay} />
                    {resetLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Send OTP</Text>
                    )}
                  </TouchableOpacity>
                )}

                <Pressable
                  style={styles.inlineAction}
                  onPress={() => {
                    setShowForgotPassword(false);
                    resetForgotPasswordState();
                  }}
                >
                  <Text style={styles.inlineActionText}>Back to login</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.formSection}>
                  <Text style={styles.sectionEyebrow}>Account Access</Text>
                  <Text style={styles.label}>Email or Phone</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email or phone"
                    placeholderTextColor="#94a3b8"
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                  />

                  <Text style={[styles.label, styles.spaced]}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                <Pressable
                  style={styles.inlineAction}
                  onPress={() => {
                    setShowForgotPassword(true);
                  }}
                >
                  <Text style={styles.inlineActionText}>Forgot password?</Text>
                </Pressable>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <View style={styles.primaryButtonOverlay} />
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Login</Text>
                  )}
                </TouchableOpacity>

                <Pressable
                  style={styles.guestLink}
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace("/(tabs)");
                    }
                  }}
                >
                  <Text style={styles.guestLinkText}>Continue without login</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.22)",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: 20,
    paddingBottom: 96,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  topSection: {
    zIndex: 1,
    alignItems: "center",
  },
  cardGlow: {
    position: "absolute",
    top: -40,
    right: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  heroBand: {
    backgroundColor: "#f8fbff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    marginBottom: 10,
  },
  heroBadgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  heroPill: {
    backgroundColor: "#dbeafe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroPillText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
  },
  title: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },
  card: {
    overflow: "hidden",
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d9e6f5",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
    width: "100%",
    maxWidth: 372,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 12,
  },
  headerSpacer: {
    flex: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eef4fb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8e4f2",
  },
  closeButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  formSection: {
    marginTop: 4,
    backgroundColor: "#fcfdff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5edf7",
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563eb",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  spaced: {
    marginTop: 14,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d4deea",
    color: "#0f172a",
    fontSize: 15,
  },
  inlineAction: {
    alignSelf: "flex-end",
    marginTop: 14,
    marginBottom: 2,
  },
  inlineActionText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    overflow: "hidden",
    backgroundColor: "#2563eb",
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 16,
    position: "relative",
  },
  primaryButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#d4deea",
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  guestLink: {
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  guestLinkText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
});
