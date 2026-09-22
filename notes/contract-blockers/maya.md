# Agent B Contract Blockers

## Idempotency Port Limitation: Cross-Endpoint Key Reuse Detection

### Issue

**Port method**: `IdempotencyRepository.findExisting(principal, endpoint, key)`  
**Unique constraint**: `(principal + key)` — NO endpoint in constraint

**Problem**:
When request A uses key `K` on endpoint `/bookings` and request B uses same key `K` on endpoint `/bookings/:id/completion`:
1. Request A writes record with endpoint `/bookings`
2. Request B hits 23505 on `(principal + key)` unique constraint
3. Error handler calls `findExisting(principal, '/bookings/:id/completion', K)`
4. Query filters by endpoint → returns `null` (record has different endpoint)
5. Cannot determine if winner had same or different hash

**Current workaround** (Line 856 in `errorHandler.ts`):
- If `findExisting` returns `null` after 23505, assume cross-endpoint key reuse
- Return `IDEMPOTENCY_KEY_REUSED` with note "跨端点"
- This correctly rejects the request but cannot replay if hashes match

### Needed Port Addition

```typescript
/**
 * Find idempotency record by principal + key WITHOUT endpoint filter
 * Used for 23505 re-read when unique constraint is (principal+key)
 * but we need to check the winner's endpoint + hash for cross-endpoint detection
 */
findByPrincipalKey(
  principal: Principal,
  idempotencyKey: string
): Promise<IdempotencyHit & { endpoint: string } | null>
```

### Same-Endpoint Race

**Status**: ✅ Correctly implemented

When both requests hit same endpoint with same key:
1. Pre-flight `findExisting` filters by endpoint → works correctly
2. On 23505 in `recordSuccess`, errorHandler re-reads with same endpoint → finds winner
3. Hash comparison determines replay vs key reuse

**Evidence**: `api/src/middleware/errorHandler.ts:840-863`

### Recommendation

Add `findByPrincipalKey` to `IdempotencyRepository` port for complete cross-endpoint race handling, or accept current limitation (cross-endpoint key reuse always rejected, never replayed).

**Severity**: Low - same-endpoint races work correctly; cross-endpoint with identical body is rare.
