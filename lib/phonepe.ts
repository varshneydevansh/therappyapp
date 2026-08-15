import { NativeModules, Platform } from "react-native";
import PhonePeSDK from "react-native-phonepe-pg";

const CUSTOM_PHONEPE_MODULE = NativeModules.PhonePeModule as
  | {
      initialize?: (
        merchantId: string,
        environment: string,
        flowId: string
      ) => Promise<unknown>;
      startCheckout?: (orderId: string, token: string) => Promise<unknown>;
    }
  | undefined;
const PHONEPE_PACKAGE_MODULE = PhonePeSDK as Partial<{
  init: (
    environment: string,
    merchantId: string,
    flowId: string,
    enableLogging: boolean
  ) => Promise<unknown>;
  startTransaction: (
    request: string,
    appSchema: string | null
  ) => Promise<unknown>;
}>;

export type PhonePeCheckoutParams = {
  orderId: string;
  token: string;
  merchantId: string;
  environment?: string;
  flowId?: string;
  paymentMode?: unknown;
  targetAppPackageName?: string;
  appSchema?: string;
};

export type PhonePeCheckoutResult = {
  status?: string;
  error?: string;
};

export function resolvePhonePePaymentMode(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "PAY_PAGE";
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed?.type && typeof parsed.type === "string") {
      return parsed.type;
    }
  } catch {
    // Plain string values such as PAY_PAGE are expected.
  }

  return value;
}

function normalizeEnvironment(environment?: string) {
  const value = String(environment || "PRODUCTION").trim().toUpperCase();
  return value === "SANDBOX" ? "SANDBOX" : "PRODUCTION";
}

function assertPhonePeAvailable() {
  const hasCustomModule =
    Platform.OS === "android" &&
    CUSTOM_PHONEPE_MODULE?.initialize &&
    CUSTOM_PHONEPE_MODULE?.startCheckout;
  const hasPackageModule =
    PHONEPE_PACKAGE_MODULE.init && PHONEPE_PACKAGE_MODULE.startTransaction;

  if (!hasCustomModule && !hasPackageModule) {
    throw new Error(
      "PhonePe native module is unavailable. Rebuild the Android app after installing the SDK."
    );
  }
}

export async function initializePhonePe(params: {
  merchantId: string;
  environment?: string;
  flowId: string;
}) {
  assertPhonePeAvailable();

  if (!params.merchantId) {
    throw new Error("PhonePe merchant ID is missing.");
  }

  const environment = normalizeEnvironment(params.environment);

  if (
    Platform.OS === "android" &&
    CUSTOM_PHONEPE_MODULE?.initialize
  ) {
    return CUSTOM_PHONEPE_MODULE.initialize(
      params.merchantId,
      environment,
      params.flowId
    );
  }

  return PHONEPE_PACKAGE_MODULE.init?.(
    environment,
    params.merchantId,
    params.flowId,
    __DEV__
  );
}

export async function startPhonePePayment(
  params: PhonePeCheckoutParams
): Promise<PhonePeCheckoutResult> {
  await initializePhonePe({
    merchantId: params.merchantId,
    environment: params.environment,
    flowId: params.flowId || params.orderId,
  });

  if (
    Platform.OS === "android" &&
    CUSTOM_PHONEPE_MODULE?.startCheckout
  ) {
    await CUSTOM_PHONEPE_MODULE.startCheckout(params.orderId, params.token);
    return { status: "SUCCESS" };
  }

  const paymentMode = resolvePhonePePaymentMode(params.paymentMode);
  const transactionRequest =
    Platform.OS === "ios"
      ? {
          merchantId: params.merchantId,
          orderId: params.orderId,
          token: params.token,
          paymentMode: {
            type: paymentMode,
            ...(params.targetAppPackageName
              ? { targetApp: params.targetAppPackageName }
              : {}),
          },
        }
      : {
          orderId: params.orderId,
          token: params.token,
          paymentMode,
          targetAppPackageName: String(params.targetAppPackageName || ""),
        };

  const response = await PHONEPE_PACKAGE_MODULE.startTransaction?.(
    JSON.stringify(transactionRequest),
    params.appSchema || "therapyapp"
  );

  return response && typeof response === "object"
    ? (response as PhonePeCheckoutResult)
    : {};
}
