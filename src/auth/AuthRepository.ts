import { Pool, PoolClient } from "pg";
import { PairRow } from "../types/requests";

export class AuthRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createUser(publicKey: string, client?: PoolClient): Promise<string> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `INSERT INTO users (public_key) VALUES ($1) RETURNING id`,
      [publicKey],
    );
    return result.rows[0].id;
  }

  async createPair(
    user1Id: string,
    pairCode: string,
    client?: PoolClient,
  ): Promise<string> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `INSERT INTO pairs (user1_id, pair_code) VALUES ($1, $2) RETURNING id`,
      [user1Id, pairCode],
    );
    return result.rows[0].id;
  }

  async cleanupExpiredPairs(client?: PoolClient): Promise<number> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE pairs 
       SET pair_code = NULL, is_active = FALSE 
       WHERE user2_id IS NULL 
         AND pair_code IS NOT NULL 
         AND created_at < NOW() - INTERVAL '24 hours'`,
    );
    return result.rowCount ?? 0;
  }

  async findPairByCode(pairCode: string): Promise<PairRow | null> {
    const result = await this.pool.query(
      `SELECT * FROM pairs 
       WHERE pair_code = $1 
         AND is_active = TRUE 
         AND user2_id IS NULL 
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [pairCode],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async joinPair(
    pairId: string,
    user2Id: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `UPDATE pairs SET pair_code = NULL, user2_id = $2 WHERE id = $1 AND user2_id IS NULL`,
      [pairId, user2Id],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async findPairByUserId(userId: string): Promise<PairRow | null> {
    const result = await this.pool.query(
      `SELECT * FROM pairs WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE LIMIT 1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async leavePair(userId: string): Promise<string | null> {
    const result = await this.pool.query(
      `UPDATE pairs 
       SET is_active = FALSE 
       WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE 
       RETURNING user1_id, user2_id`,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const { user1_id, user2_id } = result.rows[0];
    const partnerId = user1_id === userId ? user2_id : user1_id;
    return partnerId ?? null;
  }

  async getTokenVersion(userId: string): Promise<number> {
    const result = await this.pool.query(
      "SELECT token_version FROM users WHERE id = $1",
      [userId],
    );

    return result.rows[0].token_version;
  }

  async getUserPublicKey(userId: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT public_key FROM users WHERE id = $1`,
      [userId],
    );
    return result.rows[0].public_key;
  }
}
