"""Manual smoke test against a running server. Run: python -m app.tests.smoke_test"""

import uuid

import httpx

BASE = "http://127.0.0.1:8000/api/v1"


def main() -> None:
    client = httpx.Client(timeout=30)

    # health
    r = client.get(f"{BASE}/health")
    assert r.status_code == 200, r.text
    print("health ok")

    # bad login
    r = client.post(f"{BASE}/auth/login", data={"username": "cashier1", "password": "wrong"})
    assert r.status_code == 401, r.text
    print("bad login rejected")

    # good login
    r = client.post(f"{BASE}/auth/login", data={"username": "cashier1", "password": "Cashier@1234"})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["access_token"]
    branch_id = data["user"]["branch_id"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"login ok, branch={branch_id}, perms={len(data['user']['permissions'])}")

    # unauthenticated access blocked
    r = client.get(f"{BASE}/products")
    assert r.status_code == 401, r.status_code
    print("unauthenticated blocked")

    # cashier cannot adjust inventory (permission check)
    r = client.post(
        f"{BASE}/inventory/adjust", headers=headers,
        json={"variant_id": 1, "branch_id": branch_id, "quantity_change": "5",
              "movement_type": "ADJUSTMENT", "reason": "should fail"},
    )
    assert r.status_code == 403, (r.status_code, r.text)
    print("permission enforcement ok")

    # branch isolation: another branch id must be rejected
    r = client.get(f"{BASE}/pos/lookup", headers=headers, params={"code": "BLB-12W-CW", "branch_id": 999})
    assert r.status_code == 403, (r.status_code, r.text)
    print("branch isolation ok")

    # barcode lookup
    r = client.get(f"{BASE}/pos/lookup", headers=headers,
                   params={"code": "6001020000017", "branch_id": branch_id})
    assert r.status_code == 200, r.text
    item = r.json()
    qty_before = float(item["available_quantity"])
    print(f"lookup ok: {item['product_name']} {item['variant_name']} stock={qty_before}")

    # create sale
    txn = str(uuid.uuid4())
    sale_payload = {
        "transaction_id": txn,
        "branch_id": branch_id,
        "items": [{"variant_id": item["variant_id"], "quantity": "2"}],
        "payment_method": "CASH",
    }
    r = client.post(f"{BASE}/sales", headers=headers, json=sale_payload)
    assert r.status_code == 201, r.text
    sale = r.json()
    print(f"sale ok: {sale['receipt_number']} total={sale['total']}")

    # idempotent retry — must return the same sale, not create a new one
    r = client.post(f"{BASE}/sales", headers=headers, json=sale_payload)
    assert r.status_code == 201, r.text
    assert r.json()["receipt_number"] == sale["receipt_number"]
    print("idempotency ok")

    # stock decreased exactly once
    r = client.get(f"{BASE}/pos/lookup", headers=headers,
                   params={"code": "6001020000017", "branch_id": branch_id})
    qty_after = float(r.json()["available_quantity"])
    assert qty_after == qty_before - 2, (qty_before, qty_after)
    print(f"inventory deducted once: {qty_before} -> {qty_after}")

    # oversell rejected
    r = client.post(f"{BASE}/sales", headers=headers, json={
        "transaction_id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "items": [{"variant_id": item["variant_id"], "quantity": "999999"}],
    })
    assert r.status_code == 409, (r.status_code, r.text)
    print("oversell rejected")

    # excess discount rejected
    r = client.post(f"{BASE}/sales", headers=headers, json={
        "transaction_id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "items": [{"variant_id": item["variant_id"], "quantity": "1"}],
        "discount_amount": "999999",
    })
    assert r.status_code == 400, (r.status_code, r.text)
    print("excess discount rejected")

    # sales history
    r = client.get(f"{BASE}/sales", headers=headers, params={"branch_id": branch_id})
    assert r.status_code == 200 and r.json()["total"] >= 1, r.text
    print(f"sales history ok ({r.json()['total']} sales)")

    print("\nALL SMOKE TESTS PASSED")


if __name__ == "__main__":
    main()
