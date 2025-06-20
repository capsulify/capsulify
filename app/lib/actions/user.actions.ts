'use server'

import { CreateUserParams, OnboardingData } from '@/app/types'
import pool from '../database/db'
import { MONTHLY_OCCASIONS, BODY_TYPE_ID } from '@/app/constants'



// Helper function to convert string values to enum IDs (kept for backward compatibility with updateUserBodyType)
const getBodyTypeIdByName = (name: string): number => {
	const bodyTypeEntries = Object.entries(BODY_TYPE_ID)
	for (const [id, bodyTypeName] of bodyTypeEntries) {
		if (bodyTypeName === name) {
			return parseInt(id)
		}
	}
	throw new Error(`Body type '${name}' not found`)
}

const getOccasionIdByKey = (key: string): number => {
	const occasion = MONTHLY_OCCASIONS.find(item => item.key === key)
	if (!occasion) {
		throw new Error(`Occasion '${key}' not found`)
	}
	return occasion.id
}

export const createUser = async (params: CreateUserParams) => {
	const client = await pool.connect()

	try {
		await client.query('SET search_path TO capsulify_live')

		const { name, username, email, clerkId } = params

		const createUserQuery = `
      INSERT INTO users (name, username, email, clerk_id)
      VALUES ($1, $2, $3, $4)
    `

		const result = await client.query(createUserQuery, [
			name,
			username,
			email,
			clerkId,
		])
	} catch (error) {
		console.error('Error creating user:', error)
		throw new Error('Failed to create user')
	} finally {
		client.release()
	}
}

export const getUserByClerkId = async (clerkId: string) => {
	let client
	try {
		client = await pool.connect()

		await client.query('SET search_path TO capsulify_live')

		const getUserQuery = `
			SELECT * FROM users
			WHERE clerk_id = $1
			`

		const user = await client.query(getUserQuery, [clerkId])

		return user.rows[0]
	} catch (error) {
		console.error('Error getting user by clerkId:', error)
		throw new Error('Failed to get user')
	} finally {
		if (client) {
			client.release()
		}
	}
}

export const updateUserBodyType = async (bodyType: string, clerkId: string) => {
	const client = await pool.connect()
	try {
		await client.query('SET search_path TO capsulify_live')
		
		// Begin transaction
		await client.query('BEGIN')

		// Get body type ID using enum helper function
		const bodyTypeId = getBodyTypeIdByName(bodyType)

		const updateUserQuery = `
      UPDATE users SET body_shape_id = $1, onboarded = true WHERE clerk_id = $2 RETURNING id
    `

		const result = await client.query(updateUserQuery, [
			bodyTypeId,
			clerkId,
		])
		
		// Create user wardrobe using the helper function
		await insertUserWardrobe(client, result.rows[0].id, bodyTypeId)
		
		// Commit transaction
		await client.query('COMMIT')
		
		console.log('User updated successfully:', result.rows[0])
		return result.rows[0].id
	} catch (error) {
		// Rollback transaction on error
		try {
			await client.query('ROLLBACK')
		} catch (rollbackError) {
			console.error('Error rolling back transaction:', rollbackError)
		}
		console.error('Error updating user body type:', error)
		throw new Error('Failed to update user body type')
	} finally {
		client.release()
	}
}

export const updateUser = async (params: CreateUserParams) => {
	const client = await pool.connect()
	try {
		await client.query('SET search_path TO capsulify_live')
		const { name, username, email, clerkId } = params

		const updateUserQuery = `
      UPDATE users
      SET name = $1, username = $2, email = $3
      WHERE clerk_id = $4
    `
		const result = await client.query(updateUserQuery, [
			name,
			username,
			email,
			clerkId,
		])

		console.log('User updated successfully:', result)
		client.release()
	} catch (error) {
		console.error('Error updating user:', error)
		throw new Error('Failed to update user')
	}
}

export const deleteUser = async (clerkId: string) => {
	const client = await pool.connect()
	try {
		await client.query('SET search_path TO capsulify_live')

		const deleteUserQuery = `
      DELETE FROM capsulify_live.users
      WHERE clerk_id = $1
    `

		const result = await client.query(deleteUserQuery, [clerkId])

		console.log('User deleted successfully:', result)
		client.release()
	} catch (error) {
		console.error('Error deleting user:', error)
		throw new Error('Failed to delete user')
	}
}

export const saveOnboardingData = async (
	onboardingData: OnboardingData,
	clerkId: string
) => {
	const {
		ageGroupId,
		location,
		bodyTypeId,
		heightId,
		favoritePartIds,
		leastFavoritePartIds,
		personalStyleId,
		occasions,
		goal,
		frustration,
	} = onboardingData
	
	const client = await pool.connect()
	try {
		await client.query('SET search_path TO capsulify_live')
		await client.query('BEGIN')

		// Reference IDs are already provided as enum IDs
		const referenceIds = {
			ageGroupId,
			bodyTypeId,
			heightId,
			personalStyleId,
		}

		// Update user with all main fields
		const dbUserId = await updateUserMainFields(client, {
			referenceIds,
			location,
			goal,
			frustration,
			clerkId,
		})

		// Insert user preferences
		await insertUserPreferences(client, {
			dbUserId,
			favoritePartIds,
			leastFavoritePartIds,
			occasions,
		})

		// Create user wardrobe
		await insertUserWardrobe(client, dbUserId, bodyTypeId)

		await client.query('COMMIT')
		console.log('User details updated successfully')
		return dbUserId
	} catch (error) {
		await handleTransactionError(client, error)
		throw new Error('Failed to update user details')
	} finally {
		client.release()
	}
}



// Helper function to update user main fields
const updateUserMainFields = async (
	client: any,
	params: {
		referenceIds: {
			ageGroupId: number
			bodyTypeId: number
			heightId: number
			personalStyleId: number
		}
		location: string
		goal: string
		frustration: string
		clerkId: string
	}
) => {
	const { referenceIds, location, goal, frustration, clerkId } = params
	
	const updateUserQuery = `
		UPDATE users SET 
			age_group_id = $1,
			location = $2,
			body_shape_id = $3,
			height_id = $4,
			personal_style_id = $5,
			goal = $6,
			frustration = $7,
			onboarded = true
		WHERE clerk_id = $8
		RETURNING id
	`

	const updateResult = await client.query(updateUserQuery, [
		referenceIds.ageGroupId,
		location,
		referenceIds.bodyTypeId,
		referenceIds.heightId,
		referenceIds.personalStyleId,
		goal,
		frustration,
		clerkId,
	])

	if (updateResult.rows.length === 0) {
		throw new Error('User not found')
	}

	return updateResult.rows[0].id
}

// Helper function to insert user preferences (favorite parts, least favorite parts, occasions)
const insertUserPreferences = async (
	client: any,
	params: {
		dbUserId: number
		favoritePartIds: number[]
		leastFavoritePartIds: number[]
		occasions: Record<string, number>
	}
) => {
	const { dbUserId, favoritePartIds, leastFavoritePartIds, occasions } = params

	// Batch insert favorite parts using UNNEST
	if (favoritePartIds.length > 0) {
		// Delete existing favorite parts
		const deleteFavoritePartsQuery = `DELETE FROM user_fav_parts WHERE user_id = $1`
		await client.query(deleteFavoritePartsQuery, [dbUserId])
		
		// Insert new favorite parts
		const insertFavoritePartsQuery = `
			INSERT INTO user_fav_parts (user_id, fav_part_id) 
			SELECT $1, UNNEST($2::int[])
		`
		await client.query(insertFavoritePartsQuery, [dbUserId, favoritePartIds])
	}

	// Batch insert least favorite parts using UNNEST
	if (leastFavoritePartIds.length > 0) {
		// Delete existing least favorite parts
		const deleteLeastFavoritePartsQuery = `DELETE FROM user_least_fav_parts WHERE user_id = $1`
		await client.query(deleteLeastFavoritePartsQuery, [dbUserId])
		
		// Insert new least favorite parts
		const insertLeastFavoritePartsQuery = `
			INSERT INTO user_least_fav_parts (user_id, least_fav_part_id) 
			SELECT $1, UNNEST($2::int[])
		`
		await client.query(insertLeastFavoritePartsQuery, [dbUserId, leastFavoritePartIds])
	}

	// Batch insert monthly occasions using UNNEST with arrays
	const occasionEntries = Object.entries(occasions).filter(([key, value]) => value > 0)
	if (occasionEntries.length > 0) {
		const occasionIds = occasionEntries.map(([key]) => getOccasionIdByKey(key))
		const occurrenceCounts = occasionEntries.map(([, value]) => value)
		
		// Delete existing monthly occasions
		const deleteOccasionsQuery = `DELETE FROM user_monthly_occasions WHERE user_id = $1`
		await client.query(deleteOccasionsQuery, [dbUserId])
		
		// Insert new monthly occasions
		const insertOccasionsQuery = `
			INSERT INTO user_monthly_occasions (user_id, occasions_id, occurence_count) 
			SELECT $1, UNNEST($2::int[]), UNNEST($3::int[])
		`
		await client.query(insertOccasionsQuery, [dbUserId, occasionIds, occurrenceCounts])
	}
}

// Helper function to insert user wardrobe
const insertUserWardrobe = async (client: any, dbUserId: number, bodyTypeId: number) => {
	// Delete existing wardrobe items
	const deleteWardrobeQuery = `DELETE FROM user_clothing_variants WHERE user_id = $1`
	await client.query(deleteWardrobeQuery, [dbUserId])
	
	// Insert new wardrobe items directly from default_clothing_variants table
	const insertWardrobeQuery = `
		INSERT INTO user_clothing_variants (user_id, clothing_variant_id)
		SELECT $1, clothing_variant_id 
		FROM default_clothing_variants 
		WHERE body_shape_id = $2
	`
	await client.query(insertWardrobeQuery, [dbUserId, bodyTypeId])
}

// Helper function to handle transaction errors
const handleTransactionError = async (client: any, error: any) => {
	try {
		await client.query('ROLLBACK')
	} catch (rollbackError) {
		console.error('Error rolling back transaction:', rollbackError)
	}
	console.error('Error updating user details:', error)
}
