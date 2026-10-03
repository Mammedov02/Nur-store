import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthRequest, requireAdmin, requireAuth } from "../auth";

const router = Router();

/*
|--------------------------------------------------------------------------
| MÜŞTƏRİ — Aktiv kateqoriyaları göstər
|--------------------------------------------------------------------------
*/

router.get("/", async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        active: true,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
    });

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "CATEGORY_LIST_ERROR",
        message: "Kateqoriyaları yükləmək mümkün olmadı.",
      },
    });
  }
});

/*
|--------------------------------------------------------------------------
| ADMIN — Bütün kateqoriyaları göstər
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/all",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            name: "asc",
          },
        ],
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      });

      return res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "ADMIN_CATEGORY_ERROR",
          message: "Kateqoriyaları yükləmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN — Kateqoriya yarat
|--------------------------------------------------------------------------
*/

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  sortOrder: z.number().int().min(0).default(0),
});

router.post(
  "/admin",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const data = createCategorySchema.parse(req.body);

      const category = await prisma.category.create({
        data: {
          name: data.name,
          sortOrder: data.sortOrder,
        },
      });

      return res.status(201).json({
        success: true,
        data: category,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Kateqoriya məlumatları düzgün deyil.",
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CATEGORY_CREATE_ERROR",
          message: "Kateqoriya yaratmaq mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN — Kateqoriya dəyiş
|--------------------------------------------------------------------------
*/

const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.patch(
  "/admin/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const data = updateCategorySchema.parse(req.body);

      const existing = await prisma.category.findUnique({
        where: {
          id: req.params.id,
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: {
            code: "CATEGORY_NOT_FOUND",
            message: "Kateqoriya tapılmadı.",
          },
        });
      }

      const category = await prisma.category.update({
        where: {
          id: req.params.id,
        },
        data,
      });

      return res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Kateqoriya məlumatları düzgün deyil.",
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CATEGORY_UPDATE_ERROR",
          message: "Kateqoriyanı dəyişmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN — Kateqoriyanı aktiv/deaktiv et
|--------------------------------------------------------------------------
*/

router.patch(
  "/admin/:id/status",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        active: z.boolean(),
      });

      const data = schema.parse(req.body);

      const category = await prisma.category.update({
        where: {
          id: req.params.id,
        },
        data: {
          active: data.active,
        },
      });

      return res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CATEGORY_STATUS_ERROR",
          message: "Kateqoriya statusunu dəyişmək olmadı.",
        },
      });
    }
  }
);

export default router;
