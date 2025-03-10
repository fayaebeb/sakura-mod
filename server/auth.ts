import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Ensure SESSION_SECRET is set
  if (!process.env.SESSION_SECRET) {
    console.warn("⚠️ No SESSION_SECRET provided, using a default secret. This is not secure for production.");
    process.env.SESSION_SECRET = "default_secret_" + randomBytes(32).toString("hex");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      secure: process.env.NODE_ENV === "production",
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Add logging middleware for debugging auth state
  app.use((req, res, next) => {
    console.log(`🔒 Auth Debug - Path: ${req.path}, Authenticated: ${req.isAuthenticated()}`);
    if (req.isAuthenticated()) {
      console.log(`👤 User: ${req.user?.username}`);
    }
    next();
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          console.log(`❌ Login failed for user: ${username}`);
          return done(null, false);
        }
        console.log(`✅ Login successful for user: ${username}`);
        return done(null, user);
      } catch (error) {
        console.error("❌ Error in authentication:", error);
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    console.log(`📦 Serializing user: ${user.username}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        console.log(`❌ User not found during deserialization: ${id}`);
        return done(null, false);
      }
      console.log(`📂 Deserialized user: ${user.username}`);
      done(null, user);
    } catch (error) {
      console.error("❌ Error in deserialization:", error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });
    

  app.post("/api/logout", (req, res, next) => {
    const username = req.user?.username;
    req.logout((err) => {
      if (err) return next(err);
      console.log(`👋 User logged out: ${username}`);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("❌ Unauthorized access attempt to /api/user");
      return res.sendStatus(401);
    }
    console.log(`✅ User data retrieved: ${req.user?.username}`);
    res.json(req.user);
  });
}