import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthRequest, requireAdmin, requireAuth } from "../auth";

const router = Router();

/*
|--------------------------------------------------------------------------
| CUSTOMER - Məhsulları göstər
|--------------------------------------------------------------------------
*/

router.get("/", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const categoryId =
      typeof req.query.categoryId === "string"
        ? req.query.categoryId
        : undefined;

    const page = Math.max(
      Number(req.query.page ?? 1),
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit ?? 20), 1),
      100
    );

    const where = {
      active: true,

      ...(categoryId
        ? {
            categoryId,
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                sku: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                brand: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),

      prisma.product.count({
        where,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        items: products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "PRODUCT_LIST_ERROR",
        message: "Məhsulları yükləmək mümkün olmadı.",
      },
    });
  }
});

/*
|--------------------------------------------------------------------------
| CUSTOMER - Tək məhsul
|--------------------------------------------------------------------------
*/

router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        active: true,
      },
      include: {
        category: true,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "Məhsul tapılmadı.",
        },
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "PRODUCT_ERROR",
        message: "Məhsulu yükləmək mümkün olmadı.",
      },
    });
  }
});

/*
|--------------------------------------------------------------------------
| ADMIN - Bütün məhsullar
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/all",
  requireAuth,
  requireAdmin,
  async (_req: AuthRequest, res) => {
    try {
      const products = await prisma.product.findMany({
        include: {
          category: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "ADMIN_PRODUCT_ERROR",
          message: "Admin məhsul siyahısını yükləmək olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - Məhsul əlavə et
|--------------------------------------------------------------------------
*/

const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(5000).optional(),
  priceKopek: z.number().int().positive(),
  saleKopek: z.number().int().positive().nullable().optional(),
  stock: z.number().int().min(0).default(0),
  imageUrl: z.string().url().nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  categoryId: z.string().min(1),
  isNew: z.boolean().default(false),
  isPopular: z.boolean().default(false),
  isCampaign: z.boolean().default(false),
});

router.post(
  "/admin",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const data = createProductSchema.parse(req.body);

      if (
        data.saleKopek !== null &&
        data.saleKopek !== undefined &&
        data.saleKopek > data.priceKopek
      ) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SALE_PRICE",
            message:
              "Endirimli qiymət normal qiymətdən böyük ola bilməz.",
          },
        });
      }

      const category = await prisma.category.findUnique({
        where: {
          id: data.categoryId,
        },
      });

      if (!category) {
        return res.status(400).json({
          success: false,
          error: {
            code: "CATEGORY_NOT_FOUND",
            message: "Kateqoriya tapılmadı.",
          },
        });
      }

      const existingSku = await prisma.product.findUnique({
        where: {
          sku: data.sku,
        },
      });

      if (existingSku) {
        return res.status(409).json({
          success: false,
          error: {
            code: "SKU_EXISTS",
            message: "Bu SKU artıq istifadə olunur.",
          },
        });
      }

      const product = await prisma.product.create({
        data: {
          sku: data.sku,
          name: data.name,
          description: data.description,
          priceKopek: data.priceKopek,
          saleKopek: data.saleKopek,
          stock: data.stock,
          imageUrl: data.imageUrl,
          brand: data.brand,
          unit: data.unit,
          categoryId: data.categoryId,
          isNew: data.isNew,
          isPopular: data.isPopular,
          isCampaign: data.isCampaign,
        },
        include: {
          category: true,
        },
      });

      return res.status(201).json({
        success: true,
        data: product,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Məhsul məlumatlarını düzgün daxil edin.",
            details: error.issues,
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "PRODUCT_CREATE_ERROR",
          message: "Məhsul yaratmaq mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - Məhsul dəyiş
|--------------------------------------------------------------------------
*/

const updateProductSchema = createProductSchema.partial();

router.patch(
  "/admin/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const data = updateProductSchema.parse(req.body);

      const existingProduct = await prisma.product.findUnique({
        where: {
          id: req.params.id,
        },
      });

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Məhsul tapılmadı.",
          },
        });
      }

      const newPrice =
        data.priceKopek ?? existingProduct.priceKopek;

      const newSale =
        data.saleKopek !== undefined
          ? data.saleKopek
          : existingProduct.saleKopek;

      if (
        newSale !== null &&
        newSale !== undefined &&
        newSale > newPrice
      ) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SALE_PRICE",
            message:
              "Endirimli qiymət normal qiymətdən böyük ola bilməz.",
          },
        });
      }

      const product = await prisma.product.update({
        where: {
          id: req.params.id,
        },
        data,
        include: {
          category: true,
        },
      });

      return res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Məhsul məlumatları düzgün deyil.",
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "PRODUCT_UPDATE_ERROR",
          message: "Məhsulu dəyişmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - Məhsulu aktiv/deaktiv et
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

      const product = await prisma.product.update({
        where: {
          id: req.params.id,
        },
        data: {
          active: data.active,
        },
      });

      return res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "PRODUCT_STATUS_ERROR",
          message: "Məhsul statusunu dəyişmək olmadı.",
        },
      });
    }
  }
);

export default router;
