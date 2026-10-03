import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { createToken } from "../auth";

const router = Router();

const registerSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, "Telefon nömrəsi düzgün deyil.")
    .max(20),
  password: z
    .string()
    .min(6, "Şifrə ən azı 6 simvol olmalıdır.")
    .max(100),
  name: z
    .string()
    .trim()
    .min(2, "Ad ən azı 2 simvol olmalıdır.")
    .max(50),
  surname: z
    .string()
    .trim()
    .max(50)
    .optional(),
});

router.post("/register", async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: {
        phone: data.phone,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: "PHONE_EXISTS",
          message: "Bu telefon nömrəsi artıq qeydiyyatdan keçib.",
        },
      });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        phone: data.phone,
        passwordHash,
        name: data.name,
        surname: data.surname,
        role: "CUSTOMER",
      },
      select: {
        id: true,
        phone: true,
        name: true,
        surname: true,
        role: true,
        isActive: true,
      },
    });

    const token = createToken({
      id: user.id,
      phone: user.phone,
      role: user.role,
    });

    return res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Daxil etdiyiniz məlumatları yoxlayın.",
          details: error.issues,
        },
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Server xətası baş verdi.",
      },
    });
  }
});

const loginSchema = z.object({
  phone: z.string().trim().min(7).max(20),
  password: z.string().min(1).max(100),
});

router.post("/login", async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: {
        phone: data.phone,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Telefon nömrəsi və ya şifrə yanlışdır.",
        },
      });
    }

    const passwordValid = await bcrypt.compare(
      data.password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Telefon nömrəsi və ya şifrə yanlışdır.",
        },
      });
    }

    const token = createToken({
      id: user.id,
      phone: user.phone,
      role: user.role,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          surname: user.surname,
          role: user.role,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Məlumatları düzgün daxil edin.",
        },
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Server xətası baş verdi.",
      },
    });
  }
});

export default router;
