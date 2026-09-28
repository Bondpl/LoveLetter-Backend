import { Pool } from "pg";
import { PairRow } from "./types/requests";

export class AuthRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createUser(): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    );
    return result.rows[0].id;
  }

  async createPair(user1Id: string, pairCode: string): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO pairs (user1_id, pair_code) VALUES ($1, $2) RETURNING id`,
      [user1Id, pairCode],
    );
    return result.rows[0].id;
  }

  async findPairByCode(pairCode: string): Promise<PairRow | null> {
    const result = await this.pool.query(
      `SELECT * FROM pairs WHERE pair_code = $1 AND is_active = TRUE`,
      [pairCode],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async joinPair(pairId: string, user2Id: string): Promise<void> {
    await this.pool.query(`UPDATE pairs SET user2_id = $2 WHERE id = $1`, [
      pairId,
      user2Id,
    ]);
  }

  async findPairByUserId(userId: string): Promise<PairRow | null> {
    const result = await this.pool.query(
      `SELECT * FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
