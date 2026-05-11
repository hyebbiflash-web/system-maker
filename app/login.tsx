"use client";

import { useState } from "react";
import { browserLocalPersistence, GoogleAuthProvider, setPersistence, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const isInAppBrowser = navigator.userAgent.includes("Codex") || window.self !== window.top;

      if (isInAppBrowser) {
        setLoginError(
          "현재 내장 브라우저에서는 구글 로그인 이동이 막힐 수 있어요. VS Code나 일반 브라우저에서 http://localhost:3000 을 열어 로그인해주세요."
        );
        setIsLoggingIn(false);
        return;
      }

      try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);

        if (credential?.accessToken) {
          window.sessionStorage.setItem("system-maker-google-calendar-token", credential.accessToken);
          window.localStorage.setItem("system-maker-google-calendar-token", credential.accessToken);
        }

        onLogin();
      } catch (popupError) {
        const code = typeof popupError === "object" && popupError && "code" in popupError
          ? String((popupError as { code?: string }).code)
          : "";

        if (code.includes("popup")) {
          await setPersistence(auth, browserLocalPersistence);
          await signInWithRedirect(auth, googleProvider);
          window.setTimeout(() => {
            setLoginError("구글 로그인 페이지로 이동하지 못했어요. 팝업 허용 후 다시 시도해주세요.");
            setIsLoggingIn(false);
          }, 2500);
          return;
        }

        throw popupError;
      }
    } catch (e: unknown) {
      console.error(e);
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
      setLoginError(
        code.includes("unauthorized-domain")
          ? "Firebase 승인 도메인에 localhost가 없어요. Firebase Authentication > Settings > Authorized domains에 localhost를 추가해주세요."
          : "구글 로그인으로 이동하지 못했어요. 브라우저 새로고침 후 다시 시도해주세요."
      );
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F8FA",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "white",
        borderRadius: "28px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        padding: "48px 40px",
        width: "100%",
        maxWidth: "360px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "24px",
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#191f28", marginBottom: "8px" }}>
            System Maker
          </h1>
          <p style={{ color: "#8A8178", fontSize: "14px", margin: 0 }}>
            Better System, Better Balance 😊
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "white",
            border: "1px solid #E8E1D8",
            borderRadius: "18px",
            padding: "16px 24px",
            color: "#191f28",
            fontWeight: "bold",
            fontSize: "15px",
            cursor: isLoggingIn ? "default" : "pointer",
            opacity: isLoggingIn ? 0.65 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {isLoggingIn ? "Google 로그인으로 이동 중..." : "Google로 시작하기"}
        </button>

        {loginError && (
          <p style={{ color: "#B40023", fontSize: "13px", textAlign: "center", margin: 0 }}>
            {loginError}
          </p>
        )}

        {loginError && (
          <p style={{ color: "#8A8178", fontSize: "12px", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
            내장 브라우저에서 막히면 주소를 일반 브라우저에 직접 열면 됩니다.
          </p>
        )}

        <p style={{ color: "#B0A79E", fontSize: "12px", textAlign: "center", margin: 0 }}>
          로그인하면 데이터가 안전하게 저장돼요
        </p>
      </div>
    </div>
  );
}
