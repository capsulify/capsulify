"use server";

import { DEFAULT_WARDROBE } from "@/app/constants/utils";
import pool from "../database/db";
import { getUserId } from "../database/getUserId";
import { getUserByClerkId } from "./user.actions";

export const createUserWardrobe = async (userId: number, bodyType?: string) => {
  const client = await pool.connect();

  try {
    await client.query("SET search_path TO capsulify_live");
    const defaultItems = DEFAULT_WARDROBE.INVERTED_TRIANGLE;
    const createWardrobeQuery = `
  INSERT INTO user_clothing_variants (user_id, clothing_variant_id)
  SELECT $1, UNNEST($2::int[])
`;

    await client.query(createWardrobeQuery, [userId, defaultItems]);
    console.log("User wardrobe created successfully");
  } catch (error) {
    console.error("Error creating user wardrobe:", error);
    throw new Error("Failed to create user wardrobe");
  } finally {
    client.release();
  }
};

export const getUserWardrobe = async (clerkId: string) => {
  const userId = await getUserIdByClerkId(clerkId);
  if (!userId) {
    throw new Error("User not found");
  }

  const client = await pool.connect();

  try {
    await client.query("SET search_path TO capsulify_live");

    const getWardrobeQuery = `
        SELECT 
        ucv.id AS id,
        ci.category_id,
        ci.subcategory_id,
		    ci.colour_type_id,
        cv.name,
		    cv.top_sleeve_type_id,
		    cv.blouse_sleeve_type_id,
		    cv.neckline_id,
		    cv.dress_cut_id,
		    cv.bottom_cut_id,
		    cv.short_cut_id,
		    cv.skirt_cut_id,
        cv.image_file_name,
		    cv.id as clothing_variant_id
        FROM user_clothing_variants ucv
        JOIN clothing_variants cv ON ucv.clothing_variant_id = cv.id
        JOIN clothing_items ci ON cv.clothing_item_id = ci.id
        WHERE ucv.user_id = $1
        ORDER BY ucv.id
        `;

    const wardrobe = await client.query(getWardrobeQuery, [userId]);

    // SEGREGATE CLOTHING VARIANTS BY CATEGORY
    const segregatedWardrobe = wardrobe.rows.reduce((acc, item) => {
      const categoryId = item.category_id;
      if (!acc[categoryId]) {
        acc[categoryId] = [];
      }
      acc[categoryId].push(item);
      return acc;
    }, {});
    console.log("User wardrobe retrieved successfully:", segregatedWardrobe);

    return segregatedWardrobe;
  } catch (error) {
    console.error("Error getting user wardrobe:", error);
    throw new Error("Failed to get user wardrobe");
  } finally {
    client.release();
  }
};

export const getClothingVariantId = async (options: any) => {
  const client = await pool.connect();

  try {
    await client.query("SET search_path TO capsulify_live");

    // colour_type_id is in clothing_items table and rest are in clothing_variants table
    const getClothingVariantIdQuery = `
  SELECT cv.id, cv.image_file_name, cv.name
  FROM clothing_variants cv
  JOIN clothing_items ci ON cv.clothing_item_id = ci.id
  WHERE ($1::int IS NULL OR cv.top_sleeve_type_id = $1::int)
    AND ($2::int IS NULL OR cv.blouse_sleeve_type_id = $2::int)
    AND ($3::int IS NULL OR cv.neckline_id = $3::int)
    AND ($4::int IS NULL OR cv.dress_cut_id = $4::int)
    AND ($5::int IS NULL OR cv.bottom_cut_id = $5::int)
    AND ($6::int IS NULL OR cv.short_cut_id = $6::int)
    AND ($7::int IS NULL OR cv.skirt_cut_id = $7::int)
    AND ($8::int IS NULL OR ci.colour_type_id = $8::int)
`;

    const clothingVariantId = await client.query(getClothingVariantIdQuery, [
      options.top_sleeve_type_id,
      options.blouse_sleeve_type_id,
      options.neckline_id,
      options.dress_cut_id,
      options.bottom_cut_id,
      options.short_cut_id,
      options.skirt_cut_id,
      options.colour_type_id,
    ]);
    console.log(
      "Clothing variant ID retrieved successfully:",
      clothingVariantId.rows[0]
    );

    return clothingVariantId.rows[0];
  } catch (error) {
    console.error("Error getting clothing variant ID:", error);
    throw new Error("Failed to get clothing variant ID");
  } finally {
    client.release();
  }
};

export const saveClothingVariantId = async (
  user_id: number,
  clothing_variant_id: number,
  prev_clothing_variant_id: number
) => {
  const client = await pool.connect();

  try {
    await client.query("SET search_path TO capsulify_live");

    // update the clothing variant ID in the user_clothing_variants table with the user_id and prev_clothing_variant_id
    const saveClothingVariantIdQuery = `
      UPDATE user_clothing_variants
      SET clothing_variant_id = $1
      WHERE user_id = $2 AND clothing_variant_id = $3 
	`;

    const result = await client.query(saveClothingVariantIdQuery, [
      clothing_variant_id,
      user_id,
      prev_clothing_variant_id,
    ]);

    console.log("Clothing variant ID saved successfully:", result.rows[0]);

    return result.rows[0];
  } catch (error) {
    console.error("Error saving clothing variant ID:", error);
    throw new Error("Failed to save clothing variant ID");
  } finally {
    client.release();
  }
};

// TODO: Move this to middleware to make it available to every HTTP request.
async function getUserIdByClerkId(clerkId: string) {
  const client = await pool.connect();

  try {
    await client.query("SET search_path TO capsulify_live");
    const getUserIdQuery = `
			SELECT id FROM users WHERE clerk_id = $1
		`;
    const userId = await client.query(getUserIdQuery, [clerkId]);
    return Number(userId.rows[0].id);
  } catch (error) {
    console.error("Error getting user ID by clerk ID:", error);
    throw new Error("Failed to get user ID by clerk ID");
  } finally {
    client.release();
  }
}
