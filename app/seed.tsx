import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SeedScreen() {
  const handleSeed = async () => {
    Alert.alert(
      "Unavailable",
      "The app now reads from your existing Hostinger database. This development tool is no longer used."
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Development Tools</Text>
      <Text style={styles.subtitle}>
        This screen remains only as a reminder that the old development setup is no longer part of the app flow.
      </Text>
      <Pressable style={styles.button} onPress={handleSeed}>
        <Text style={styles.text}>Hostinger DB Mode Enabled</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, backgroundColor: "#f8fafc" },
  title: { fontSize: 28, fontWeight: "800", color: "#0f172a" },
  subtitle: { marginTop: 10, marginBottom: 24, textAlign: "center", color: "#475569", lineHeight: 22 },
  button: { backgroundColor: "#2563eb", paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12 },
  text: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
