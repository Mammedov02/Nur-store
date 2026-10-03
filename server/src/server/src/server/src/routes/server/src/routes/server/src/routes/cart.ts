import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthRequest, requireAuth } from "../auth";

const router = Router();

/*
|--------------------------------------------------------------------------
| SƏBƏTİ GƏTİR
|--------------------------------------------------------------------------
*/

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: {
        userId: req.user!.id,
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      return res.json({
        success: true,
        data: {
          id: null,
          items: [],
        },
      });
    }

    return res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: {
        code: "CART_ERROR",
        message: "Səbəti yükləmək mümkün olmadı.",
      },
    });
  }
});

/*
|--------------------------------------------------------------------------
| MƏHSULU SƏBƏTƏ ƏLAVƏ ET
|--------------------------------------------------------------------------
*/

const addToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
});

router.post(
  "/items",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const data = addToCartSchema.parse(req.body);

      const product = await prisma.product.findFirst({
        where: {
          id: data.productId,
          active: true,
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

      if (product.stock < data.quantity) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: "Məhsulun kifayət qədər stoku yoxdur.",
          },
        });
      }

      const cart = await prisma.cart.upsert({
        where: {
          userId: req.user!.id,
        },
        create: {
          userId: req.user!.id,
        },
        update: {},
      });

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },
      });

      const newQuantity =
        (existingItem?.quantity ?? 0) + data.quantity;

      if (newQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message:
              "Səbətdəki məhsul miqdarı mövcud stokdan çox ola bilməz.",
          },
        });
      }

      const item = await prisma.cartItem.upsert({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },
        create: {
          cartId: cart.id,
          productId: product.id,
          quantity: data.quantity,
        },
        update: {
          quantity: newQuantity,
        },
        include: {
          product: true,
        },
      });

      return res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Məhsul və miqdar məlumatları düzgün deyil.",
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CART_ADD_ERROR",
          message: "Məhsulu səbətə əlavə etmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SƏBƏT MƏHSULUNUN MİQDARINI DƏYİŞ
|--------------------------------------------------------------------------
*/

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(100),
});

router.patch(
  "/items/:itemId",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const data = updateCartItemSchema.parse(req.body);

      const item = await prisma.cartItem.findFirst({
        where: {
          id: req.params.itemId,
          cart: {
            userId: req.user!.id,
          },
        },
        include: {
          product: true,
        },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: {
            code: "CART_ITEM_NOT_FOUND",
            message: "Səbət məhsulu tapılmadı.",
          },
        });
      }

      if (!item.product.active) {
        return res.status(400).json({
          success: false,
          error: {
            code: "PRODUCT_INACTIVE",
            message: "Bu məhsul artıq satışda deyil.",
          },
        });
      }

      if (data.quantity > item.product.stock) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: "Bu qədər məhsul stokda yoxdur.",
          },
        });
      }

      const updatedItem = await prisma.cartItem.update({
        where: {
          id: item.id,
        },
        data: {
          quantity: data.quantity,
        },
        include: {
          product: true,
        },
      });

      return res.json({
        success: true,
        data: updatedItem,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Miqdar düzgün deyil.",
          },
        });
      }

      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CART_UPDATE_ERROR",
          message: "Səbəti dəyişmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SƏBƏTDƏN MƏHSULU SİL
|--------------------------------------------------------------------------
*/

router.delete(
  "/items/:itemId",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const item = await prisma.cartItem.findFirst({
        where: {
          id: req.params.itemId,
          cart: {
            userId: req.user!.id,
          },
        },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: {
            code: "CART_ITEM_NOT_FOUND",
            message: "Səbət məhsulu tapılmadı.",
          },
        });
      }

      await prisma.cartItem.delete({
        where: {
          id: item.id,
        },
      });

      return res.json({
        success: true,
        data: {
          message: "Məhsul səbətdən silindi.",
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CART_DELETE_ERROR",
          message: "Məhsulu səbətdən silmək mümkün olmadı.",
        },
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SƏBƏTİ TAM TƏMİZLƏ
|--------------------------------------------------------------------------
*/

router.delete(
  "/",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const cart = await prisma.cart.findUnique({
        where: {
          userId: req.user!.id,
        },
      });

      if (cart) {
        await prisma.cartItem.deleteMany({
          where: {
            cartId: cart.id,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          message: "Səbət təmizləndi.",
        },
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error: {
          code: "CART_CLEAR_ERROR",
          message: "Səbəti təmizləmək mümkün olmadı.",
        },
      });
    }
  }
);

export default router;
