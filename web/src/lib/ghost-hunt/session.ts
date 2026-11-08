import "server-only";

import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "ghost_hunt_session";
const SESSION_MAX_AGE = 60 * 60 * 8;

function getSessionKey() {
  const secret = process.env.GHOST_HUNT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GHOST_HUNT_SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSession() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("ghost-hunt")
    .setAudience("ghost-hunt-web")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSessionKey());
}

export async function isAdminSessionValid(token?: string | null) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      issuer: "ghost-hunt",
      audience: "ghost-hunt-web",
      algorithms: ["HS256"],
    });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export const adminSessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_MAX_AGE,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
