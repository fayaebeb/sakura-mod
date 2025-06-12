import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, users } from "@shared/schema";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { sql } from "drizzle-orm";

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
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in environment variables');
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: true,
      httpOnly: true,
      sameSite: 'strict'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5
  });

  app.use((req, res, next) => {
    console.log(`🔒 Auth Debug - Path: ${req.path}, Authenticated: ${req.isAuthenticated()}`);
    if (req.isAuthenticated()) {
      console.log(`👤 User: ${req.user?.username}`);
    }
    next();
  });

  passport.use(new LocalStrategy(async (username, password, done) => {
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
  }));

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
    try {
      const { inviteToken, ...userData } = req.body;
      
      // Verify that the invite token is valid
      const isValidToken = await storage.validateInviteToken(inviteToken);
      if (!isValidToken) {
        return res.status(400).send("Invalid or expired invite token");
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Create the user - isAdmin will be set to true by default via the schema
      const user = await storage.createUser({
        username: userData.username,
        password: await hashPassword(userData.password),
        isAdmin: userData.isAdmin ?? true,
      });

      // Mark the token as used
      await storage.useInviteToken(inviteToken, user.id);

      // Log the user in
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({ id: user.id, username: user.username });
      });
    } catch (error) {
      console.error("❌ Error in registration:", error);
      res.status(500).send("Registration failed");
    }
  });

  app.post("/api/login", loginLimiter, passport.authenticate("local"), (req, res) => {
    res.status(200).json({ id: req.user!.id, username: req.user!.username });
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
    res.json({ 
      id: req.user!.id, 
      username: req.user!.username,
      isAdmin: req.user!.isAdmin
    });
  });

  // Admin only routes
  
  // Middleware to check for admin access - now all authenticated users are treated as admins
  function requireAdmin(req: any, res: any, next: any) {
    if (!req.isAuthenticated()) {
      return res.status(401).send('Authentication required');
    }
    
    // No longer checking for isAdmin - all authenticated users are allowed
    // if (!req.user!.isAdmin) {
    //   return res.status(403).send('Admin privileges required');
    // }
    
    next();
  }

  // Route to create a new invite token (admin only)
  app.post("/api/admin/invite-tokens", requireAdmin, async (req, res) => {
    try {
      const createdById = req.user!.id;
      const token = await storage.createInviteToken(createdById);
      res.status(201).json({ token: token.token });
    } catch (error) {
      console.error("❌ Error creating invite token:", error);
      res.status(500).send("Failed to create invite token");
    }
  });

  // Route to list all valid invite tokens (admin only)
  app.get("/api/admin/invite-tokens", requireAdmin, async (req, res) => {
    try {
      const tokens = await storage.getValidInviteTokens();
      res.status(200).json(tokens);
    } catch (error) {
      console.error("❌ Error listing invite tokens:", error);
      res.status(500).send("Failed to list invite tokens");
    }
  });
  
  // Route to upgrade all users to admin status
  // Note: This is a one-time operation to support the new "all users are admins" policy
  app.post("/api/admin/upgrade-all-users", requireAdmin, async (req, res) => {
    try {
      const result = await db.update(users)
        .set({ isAdmin: true })
        .where(sql`1=1`); // Update all users
      
      res.status(200).json({ message: "All users have been upgraded to admin status" });
    } catch (error) {
      console.error("❌ Error upgrading users:", error);
      res.status(500).send("Failed to upgrade users");
    }
  });
}


import { Request, Response, NextFunction } from "express";

export function authMiddleware(handler: (req: Request, res: Response, user: Express.User) => any) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.() || !req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return handler(req, res, req.user);
  };
}