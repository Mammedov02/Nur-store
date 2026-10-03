import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    phone: string;
    role: Role;
  };
}

export function createToken(user: {
  id: string;
  phone: string;
  role: Role;
}) {
  return jwt.sign(
    {
      id: user.id,
      phone: user.phone,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Giriş tələb olunur.",
        },
      });
    }

    const token = header.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      phone: string;
      role: Role;
    };

    req.user = {
      id: decoded.id,
      phone: decoded.phone,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_TOKEN",
        message: "Sessiya etibarsızdır. Yenidən daxil olun.",
      },
    });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const role = req.user?.role;

  const allowedRoles: Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.WAREHOUSE,
    Role.ORDER_OPERATOR,
    Role.COURIER,
  ];

  if (!role || !allowedRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Bu bölməyə giriş icazəniz yoxdur.",
      },
    });
  }

  next();
}

export function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== Role.SUPER_ADMIN) {
    return res.status(403).json({
      success: false,
      error: {
        code: "SUPER_ADMIN_REQUIRED",
        message: "Bu əməliyyat üçün Super Admin icazəsi lazımdır.",
      },
    });
  }

  next();
}
