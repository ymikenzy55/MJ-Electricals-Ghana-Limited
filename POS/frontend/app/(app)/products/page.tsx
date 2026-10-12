"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@/components/Icons";
import { api, ApiError, getStoredUser } from "@/lib/api";
import { PageHeader, Pagination, cedi } from "@/components/ui";
import { ImagePicker, MultiImagePicker, type ExtraImage } from "@/components/ImageUpload";
import OptionsBuilder, { type OptionRow } from "@/components/OptionsBuilder";
import type { Branch, Brand, Category, Paginated, Product, Variant } from "@/lib/types";

export default function ProductsPage() {
  return (
    <ProductList />
  );
}

/** Editable copy of a variant row inside the edit-product modal. */
type VariantEdit = Variant;

function ProductList() {
  const user = getStoredUser();
  const canAdjustStock = user?.permissions.includes("inventory.adjust") ?? false;
  const canEdit = user?.permissions.includes("products.update") ?? false;
  const [data, setData] = useState<Paginated<Product> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(user?.branch_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: number[]; label: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Stock edit state
  const [editVariant, setEditVariant] = useState<{ product: Product; variant: Variant } | null>(null);
  const [editQty, setEditQty] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Product edit modal state
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eImage, setEImage] = useState("");
  const [eExtraImages, setEExtraImages] = useState<ExtraImage[]>([]);
  const [eCategory, setECategory] = useState<number | null>(null);
  const [eBrand, setEBrand] = useState<number | null>(null);
  const [ePublish, setEPublish] = useState(false);
  const [eActive, setEActive] = useState(true);
  const [eVariants, setEVariants] = useState<VariantEdit[]>([]);
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState<string | null>(null);

  // Form state
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pStock, setPStock] = useState("");
  const [pCategory, setPCategory] = useState<number | null>(null);
  const [pBrand, setPBrand] = useState<number | null>(null);
  const [pImage, setPImage] = useState("");
  const [pExtraImages, setPExtraImages] = useState<ExtraImage[]>([]);
  const [pPublishWebsite, setPPublishWebsite] = useState(false);
  const [pVariant, setPVariant] = useState("");
  const [pSku, setPSku] = useState("");
  const [pBarcode, setPBarcode] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCost, setPCost] = useState("");
  const [pUnit, setPUnit] = useState("pcs");
  const [pReorder, setPReorder] = useState("0");
  const [attributes, setAttributes] = useState<{ key: string; value: string }[]>([]);
  const [hasOptions, setHasOptions] = useState(false);
  const [optRows, setOptRows] = useState<OptionRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Inline category/brand creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  const load = useCallback(async (q: string, p: number, b: number | null) => {
    const res = await api<Paginated<Product>>("/api/v1/products", {
      params: { search: q || undefined, page: p, page_size: 50, branch_id: b ?? undefined },
    });
    setData(res);
  }, []);

  useEffect(() => {
    // Products load immediately, don't wait for categories/branches/branches.
    load("", 1, user?.branch_id ?? null).catch(() => setData(null));
    api<Category[]>("/api/v1/categories").then(setCategories).catch(() => {});
    api<Brand[]>("/api/v1/brands").then(setBrands).catch(() => {});
    api<Branch[]>("/api/v1/branches")
      .then((bs) => {
        setBranches(bs);
        // Admins have no fixed branch: adopt the first branch and reload once
        // so per-branch stock figures populate.
        if (user?.branch_id == null && bs[0]) {
          setBranchId(bs[0].id);
          load("", 1, bs[0].id).catch(() => null);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const cat = await api<Category>("/api/v1/categories", { method: "POST", body: { name: newCategoryName.trim() } });
      setCategories([...categories, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setPCategory(cat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create category");
    }
  }

  async function createBrand() {
    if (!newBrandName.trim()) return;
    try {
      const br = await api<Brand>("/api/v1/brands", { method: "POST", body: { name: newBrandName.trim() } });
      setBrands([...brands, br].sort((a, b) => a.name.localeCompare(b.name)));
      setPBrand(br.id);
      setNewBrandName("");
      setShowNewBrand(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create brand");
    }
  }

  async function createProduct() {
    setError(null); setSuccess(null);
    if (hasOptions) {
      if (!pName || !pSku || !pPrice) { setError("Name, base SKU and starting price are required"); return; }
      if (optRows.length === 0) { setError("Add at least one option value, or switch options off"); return; }
      if (optRows.some((r) => !r.sku.trim() || !(parseFloat(r.price) >= 0))) { setError("Every option needs a SKU and a price"); return; }
    } else if (!pName || !pVariant || !pSku || !pPrice) { setError("Name, variant, SKU and selling price are required"); return; }
    setBusy(true);
    try {
      const attrObj: Record<string, string> = {};
      attributes.forEach((a) => { if (a.key && a.value) attrObj[a.key] = a.value; });

      await api("/api/v1/products", {
        method: "POST",
        body: {
          name: pName, category_id: pCategory, brand_id: pBrand,
          description: pDesc.trim() || null,
          image_url: pImage.trim() || null,
          extra_images: pExtraImages
            .filter((i) => i.url.trim())
            .map((i) => ({ url: i.url.trim(), label: i.label.trim() || null })),
          is_published_to_website: pPublishWebsite,
          variants: hasOptions
            ? optRows.map((r) => ({
                variant_name: r.label, sku: r.sku.trim(), barcode: r.barcode.trim() || null,
                unit: pUnit, cost_price: r.cost || null, selling_price: r.price,
                reorder_level: pReorder, attributes: r.attrs,
              }))
            : [{
                variant_name: pVariant, sku: pSku, barcode: pBarcode || null,
                unit: pUnit, cost_price: pCost || null, selling_price: pPrice,
                reorder_level: pReorder, attributes: attrObj,
              }],
          initial_stock: pStock.trim() ? pStock.trim() : null,
          stock_branch_id: branchId,
        },
      });
      setSuccess(`Product "${pName}" created${pPublishWebsite ? " and published to the website" : ""}.`);
      setShowForm(false);
      setPName(""); setPDesc(""); setPStock(""); setPImage(""); setPExtraImages([]); setPPublishWebsite(false); setPVariant(""); setPSku(""); setPBarcode(""); setPPrice(""); setPCost(""); setPReorder("0");
      setAttributes([]); setHasOptions(false); setOptRows([]);
      // Products list is newest-first, reload page 1 so the new item is on top.
      setPage(1);
      await load(search, 1, branchId);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  function onSearch(q: string) {
    setSearch(q);
    setPage(1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q, 1, branchId).catch(() => null), 300);
  }

  function onBranchChange(b: number) {
    setBranchId(b);
    setPage(1);
    load(search, 1, b).catch(() => null);
  }

  function openStockEdit(product: Product, variant: Variant) {
    if (!canAdjustStock || branchId === null) return;
    setEditVariant({ product, variant });
    setEditQty(String(parseFloat(variant.stock_quantity ?? "0")));
    setConfirming(false);
    setEditError(null);
  }

  async function saveStockEdit() {
    if (!editVariant || branchId === null) return;
    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty < 0) {
      setEditError("Enter a valid quantity (0 or more)");
      return;
    }
    const current = parseFloat(editVariant.variant.stock_quantity ?? "0");
    const change = newQty - current;
    if (change === 0) { setEditVariant(null); return; }
    setEditBusy(true);
    setEditError(null);
    try {
      await api("/api/v1/inventory/adjust", {
        method: "POST",
        body: {
          variant_id: editVariant.variant.id,
          branch_id: branchId,
          quantity_change: change,
          movement_type: "CORRECTION",
        },
      });
      setEditVariant(null);
      setSuccess(`Stock updated for ${editVariant.product.name}, ${editVariant.variant.variant_name}`);
      await load(search, page, branchId);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "Failed to update stock");
    } finally {
      setEditBusy(false);
      setConfirming(false);
    }
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setEName(p.name);
    setEDesc(p.description ?? "");
    setEImage(p.image_url ?? "");
    setEExtraImages((p.extra_images ?? []).map((i) => ({ url: i.url, label: i.label ?? "" })));
    setECategory(p.category_id);
    setEBrand(p.brand_id);
    setEPublish(p.is_published_to_website);
    setEActive(p.is_active);
    setEVariants(p.variants.map((v) => ({ ...v })));
    setEError(null);
  }

  function updateEVariant(id: number, field: keyof VariantEdit, value: string | boolean | number | null) {
    setEVariants((vs) => vs.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  }

  async function saveEdit() {
    if (!editProduct) return;
    if (!eName.trim()) { setEError("Product name is required"); return; }
    setEBusy(true);
    setEError(null);
    try {
      // Patch the product, only send fields that changed.
      const patch: Record<string, unknown> = {};
      if (eName.trim() !== editProduct.name) patch.name = eName.trim();
      const desc = eDesc.trim() || null;
      if (desc !== (editProduct.description ?? null)) patch.description = desc;
      const img = eImage.trim() || null;
      if (img !== (editProduct.image_url ?? null)) patch.image_url = img;
      const extras = eExtraImages
        .filter((i) => i.url.trim())
        .map((i) => ({ url: i.url.trim(), label: i.label.trim() || null }));
      if (JSON.stringify(extras) !== JSON.stringify(editProduct.extra_images ?? [])) patch.extra_images = extras;
      if (eCategory !== editProduct.category_id) patch.category_id = eCategory;
      if (eBrand !== editProduct.brand_id) patch.brand_id = eBrand;
      if (ePublish !== editProduct.is_published_to_website) patch.is_published_to_website = ePublish;
      if (eActive !== editProduct.is_active) patch.is_active = eActive;
      if (Object.keys(patch).length > 0) {
        await api(`/api/v1/products/${editProduct.id}`, { method: "PATCH", body: patch });
      }
      // Patch each variant whose fields changed.
      const orig = new Map(editProduct.variants.map((v) => [v.id, v]));
      for (const v of eVariants) {
        const o = orig.get(v.id);
        if (!o) continue;
        const vpatch: Record<string, unknown> = {};
        if (v.variant_name !== o.variant_name) vpatch.variant_name = v.variant_name;
        if ((v.barcode ?? null) !== (o.barcode ?? null)) vpatch.barcode = v.barcode || null;
        if (v.unit !== o.unit) vpatch.unit = v.unit;
        const cost = v.cost_price === "" || v.cost_price === null ? null : String(v.cost_price);
        if (cost !== (o.cost_price ?? null)) vpatch.cost_price = cost;
        const price = String(v.selling_price);
        if (price !== o.selling_price) vpatch.selling_price = price;
        const reorder = String(v.reorder_level);
        if (reorder !== o.reorder_level) vpatch.reorder_level = reorder;
        if (v.is_active !== o.is_active) vpatch.is_active = v.is_active;
        if (Object.keys(vpatch).length > 0) {
          await api(`/api/v1/variants/${v.id}`, { method: "PATCH", body: vpatch });
        }
      }
      setEditProduct(null);
      setSuccess(`Product "${eName.trim()}" updated.`);
      await load(search, page, branchId);
    } catch (e) {
      setEError(e instanceof ApiError ? e.message : "Failed to update product");
    } finally {
      setEBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  // Suggested attributes by category
  const pageIds = data?.items.map((p) => p.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleOne(id: number) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function togglePage() {
    setSelected((prev) => { const n = new Set(prev); if (allOnPage) pageIds.forEach((i) => n.delete(i)); else pageIds.forEach((i) => n.add(i)); return n; });
  }
  async function selectAllMatching() {
    if (!data) return;
    setBulkBusy(true);
    try {
      const ids = new Set<number>();
      const totalPages = Math.ceil(data.total / 100);
      for (let pg = 1; pg <= totalPages; pg++) {
        const r = await api<Paginated<Product>>("/api/v1/products", { params: { search: search || undefined, page: pg, page_size: 100 } });
        r.items.forEach((x) => ids.add(x.id));
      }
      setSelected(ids);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not select all"); }
    finally { setBulkBusy(false); }
  }
  async function runDelete() {
    if (!confirmDelete) return;
    setBulkBusy(true); setError(null);
    try {
      const res = await api<{ deleted: number; archived: number; missing: number }>("/api/v1/products/bulk-delete", { method: "POST", body: { ids: confirmDelete.ids } });
      const parts = [];
      if (res.deleted) parts.push(`${res.deleted} deleted`);
      if (res.archived) parts.push(`${res.archived} archived because they have sales or purchase history`);
      setSuccess(parts.join(", ") || "Nothing to delete");
      setSelected(new Set());
      setConfirmDelete(null);
      await load(search, page, branchId);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed"); setConfirmDelete(null); }
    finally { setBulkBusy(false); }
  }
  async function bulkPublish(publish: boolean) {
    setBulkBusy(true); setError(null);
    try {
      for (const id of selected) await api(`/api/v1/products/${id}`, { method: "PATCH", body: { is_published_to_website: publish } });
      setSuccess(`${selected.size} product${selected.size === 1 ? "" : "s"} ${publish ? "published to" : "removed from"} the website`);
      setSelected(new Set());
      await load(search, page, branchId);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Update failed"); }
    finally { setBulkBusy(false); }
  }

  const selectedCategory = categories.find((c) => c.id === pCategory);
  const suggestedAttrs = getSuggestedAttrs(selectedCategory?.name ?? "");

  return (
    <div className="min-h-full">
      <PageHeader
        title="Products"
        breadcrumb="Products"
        actions={
          <>
            {branches.length > 1 && (
              <select
                value={branchId ?? ""}
                onChange={(e) => onBranchChange(Number(e.target.value))}
                className="rounded border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
                title="Branch for stock levels"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search name, SKU, barcode..."
              className="w-72 rounded border border-[#DADDE6] bg-white px-3 py-2 text-sm focus:border-[#061161] focus:outline-none"
            />
            <button onClick={() => { setShowForm(!showForm); setAttributes([]); }} className="rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C]">
              {showForm ? "Cancel" : "+ Add Product"}
            </button>
          </>
        }
      />
      <div className="p-6">
      {error && <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{error}</div>}
      {success && <div className="mb-4 rounded border border-[#16803C]/30 bg-[#16803C]/10 px-3 py-2 text-sm text-[#16803C]">{success}</div>}

      {showForm && (
        <div className="mb-6 rounded-xl border border-[#DADDE6] bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase text-[#4A5060]">New Product</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Product Name *"><input value={pName} onChange={(e) => setPName(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>

            {/* Image picker */}
            <Field label="Product Image">
              <ImagePicker
                value={pImage}
                onChange={setPImage}
                onError={(m) => setError(m)}
              />
            </Field>

            {/* Publish to website */}
            <Field label="Publish to Website">
              <label className="flex h-[38px] items-center gap-2 rounded border border-[#DADDE6] px-3 text-sm">
                <input
                  type="checkbox"
                  checked={pPublishWebsite}
                  onChange={(e) => setPPublishWebsite(e.target.checked)}
                  className="h-4 w-4 rounded border-[#DADDE6] text-[#061161] focus:ring-[#061161]"
                />
                <span className="text-[#0B0E1A]">
                  {pPublishWebsite ? "Will be visible on website" : "Not published to website"}
                </span>
              </label>
            </Field>

            {/* Category, "+ New category" lives inside the dropdown, input directly below */}
            <Field label="Category">
              <select
                value={showNewCategory ? "__new__" : pCategory ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowNewCategory(true);
                    setPCategory(null);
                  } else {
                    setShowNewCategory(false);
                    setPCategory(e.target.value ? Number(e.target.value) : null);
                  }
                }}
                className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">+ New category…</option>
              </select>
              {showNewCategory && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[#C7CCE9] bg-[#EDEFF9] p-2 sm:flex-row">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createCategory(); } }}
                    placeholder="New category name (e.g. Lighting, Cables)"
                    autoFocus
                    className="flex-1 rounded border border-[#DADDE6] px-3 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={createCategory} className="flex-1 rounded-full bg-[#061161] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0A1C8C] sm:flex-none">Add</button>
                    <button type="button" onClick={() => setShowNewCategory(false)} className="flex-1 rounded border border-[#DADDE6] bg-white px-3 py-1.5 text-xs sm:flex-none">Cancel</button>
                  </div>
                </div>
              )}
            </Field>

            {/* Brand, same pattern as category */}
            <Field label="Brand">
              <select
                value={showNewBrand ? "__new__" : pBrand ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setShowNewBrand(true);
                    setPBrand(null);
                  } else {
                    setShowNewBrand(false);
                    setPBrand(e.target.value ? Number(e.target.value) : null);
                  }
                }}
                className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="__new__">+ New brand…</option>
              </select>
              {showNewBrand && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[#C7CCE9] bg-[#EDEFF9] p-2 sm:flex-row">
                  <input
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createBrand(); } }}
                    placeholder="New brand name (e.g. Philips, Schneider)"
                    autoFocus
                    className="flex-1 rounded border border-[#DADDE6] px-3 py-1.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={createBrand} className="flex-1 rounded-full bg-[#061161] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0A1C8C] sm:flex-none">Add</button>
                    <button type="button" onClick={() => setShowNewBrand(false)} className="flex-1 rounded border border-[#DADDE6] bg-white px-3 py-1.5 text-xs sm:flex-none">Cancel</button>
                  </div>
                </div>
              )}
            </Field>

            <div className="col-span-2 md:col-span-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#C7CCE9] bg-[#F7F8FE] p-3">
                <input type="checkbox" checked={hasOptions} onChange={(e) => setHasOptions(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="block text-sm font-bold text-[#0B0E1A]">This product comes in options</span>
                  <span className="block text-xs text-[#4A5060]">Turn this on for products such as cables (sizes and colours), bulbs (wattage and base) or switches (gangs). The website then shows simple choices and filters for shoppers.</span>
                </span>
              </label>
            </div>
            {hasOptions && (
              <div className="col-span-2 md:col-span-3">
                <OptionsBuilder category={selectedCategory?.name ?? ""} baseSku={pSku} basePrice={pPrice} baseCost={pCost} onRows={setOptRows} />
              </div>
            )}
            {!hasOptions && <Field label="Variant Name *">
              <input value={pVariant} onChange={(e) => setPVariant(e.target.value)} placeholder="e.g. 12W Cool White E27" className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
            </Field>}
            <Field label={hasOptions ? "Base SKU * (each option adds its own ending)" : "SKU *"}><input value={pSku} onChange={(e) => setPSku(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>
            {!hasOptions && <Field label="Barcode"><input value={pBarcode} onChange={(e) => setPBarcode(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>}
            <Field label="Unit">
              <select value={pUnit} onChange={(e) => setPUnit(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                <option value="pcs">pcs</option>
                <option value="box">box</option>
                <option value="roll">roll</option>
                <option value="m">metre (m)</option>
                <option value="kg">kg</option>
                <option value="set">set</option>
                <option value="pack">pack</option>
              </select>
            </Field>
            <Field label={hasOptions ? "Starting cost price (GH₵)" : "Cost Price (GH₵)"}><input type="number" step="0.01" value={pCost} onChange={(e) => setPCost(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>
            <Field label={hasOptions ? "Starting selling price (GH₵) *" : "Selling Price (GH₵) *"}><input type="number" step="0.01" value={pPrice} onChange={(e) => setPPrice(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>
            <Field label="Reorder Level"><input type="number" value={pReorder} onChange={(e) => setPReorder(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" /></Field>
            <Field label={`Opening Stock${hasOptions ? " for each option" : ""}${branchId !== null ? ` (${branches.find((b) => b.id === branchId)?.name ?? "branch"})` : ""}`}>
              <input
                type="number" min="0" step="any" value={pStock}
                onChange={(e) => setPStock(e.target.value)}
                placeholder="e.g. 50"
                className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
              />
            </Field>
          </div>

          {/* Description, shown on the website product page */}
          <div className="mt-4">
            <Field label="Description (optional)">
              <textarea
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
                rows={2}
                placeholder="Short description shown on the website product page"
                className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
              />
            </Field>
          </div>

          {/* Extra website images, optional, max 5, each with a label */}
          <div className="mt-4">
            <Field label="Website Sub-Images (optional, e.g. different glow colours, cable colours)">
              <MultiImagePicker value={pExtraImages} onChange={setPExtraImages} onError={(m) => setError(m)} />
            </Field>
          </div>

          {/* Attribute builder */}
          {!hasOptions && <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[#0B0E1A]">Product Attributes (optional)</span>
              <button type="button" onClick={() => setAttributes([...attributes, { key: "", value: "" }])} className="rounded border border-[#DADDE6] px-2 py-1 text-xs hover:bg-[#FAFAFC]">
                + Add Attribute
              </button>
            </div>
            {suggestedAttrs.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {suggestedAttrs.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      if (!attributes.some((x) => x.key === a)) {
                        setAttributes([...attributes, { key: a, value: "" }]);
                      }
                    }}
                    className="rounded-full border border-[#DADDE6] bg-[#FAFAFC] px-2 py-0.5 text-xs text-[#4A5060] hover:bg-[#EDEFF9]"
                  >
                    + {a}
                  </button>
                ))}
              </div>
            )}
            {attributes.length > 0 && (
              <div className="space-y-2">
                {attributes.map((attr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={attr.key}
                      onChange={(e) => setAttributes(attributes.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                      placeholder="Attribute (e.g. Wattage, Colour, Length)"
                      className="w-40 rounded border border-[#DADDE6] px-3 py-1.5 text-sm"
                    />
                    <input
                      value={attr.value}
                      onChange={(e) => setAttributes(attributes.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                      placeholder="Value (e.g. 12W, Cool White, 100m)"
                      className="flex-1 rounded border border-[#DADDE6] px-3 py-1.5 text-sm"
                    />
                    <button type="button" onClick={() => setAttributes(attributes.filter((_, j) => j !== i))} className="text-[#6B7183] hover:text-[#C62828]"><IconX className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          }

          <button onClick={createProduct} disabled={busy} className="mt-4 rounded-full bg-[#061161] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50">
            {busy ? "Creating..." : "Create Product"}
          </button>
        </div>
      )}
      {canEdit && selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#061161]/30 bg-[#EDEFF9] px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-[#061161]">{selected.size} selected</span>
          {data && selected.size < data.total && (
            <button onClick={selectAllMatching} disabled={bulkBusy} className="text-sm font-semibold text-[#061161] underline">Select all {data.total}</button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => bulkPublish(true)} disabled={bulkBusy} className="rounded-lg border border-[#DADDE6] bg-white px-3 py-1.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FAFAFC] disabled:opacity-50">Publish to website</button>
            <button onClick={() => bulkPublish(false)} disabled={bulkBusy} className="rounded-lg border border-[#DADDE6] bg-white px-3 py-1.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FAFAFC] disabled:opacity-50">Hide from website</button>
            <button onClick={() => setConfirmDelete({ ids: [...selected], label: `${selected.size} product${selected.size === 1 ? "" : "s"}` })} disabled={bulkBusy} className="rounded-lg bg-[#C62828] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#A32020] disabled:opacity-50">Delete selected</button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 text-sm font-semibold text-[#4A5060]">Clear</button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded border border-[#DADDE6] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
            <tr>
              {canEdit && <th className="w-10 px-4 py-2"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} className="h-4 w-4" /></th>}
              <th className="px-4 py-2 w-16">Image</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Website</th>
              <th className="px-4 py-2">Variants</th>
              {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {data === null && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t border-[#DADDE6]">
                {canEdit && <td className="px-4 py-3" />}
                <td className="px-4 py-3"><div className="h-12 w-12 animate-pulse rounded-xl bg-[#EDEFF9]" /></td>
                <td className="px-4 py-3"><div className="h-4 w-40 animate-pulse rounded bg-[#EDEFF9]" /></td>
                <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-[#EDEFF9]" /></td>
                <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-[#EDEFF9]" /></td>
                <td className="px-4 py-3"><div className="h-5 w-20 animate-pulse rounded-full bg-[#EDEFF9]" /></td>
                <td className="px-4 py-3"><div className="h-4 w-56 animate-pulse rounded bg-[#EDEFF9]" /></td>
                {canEdit && <td className="px-4 py-3" />}
              </tr>
            ))}
            {data?.items.map((p) => (
              <tr key={p.id} className={`border-t border-[#DADDE6] align-top ${selected.has(p.id) ? "bg-[#F4F5FC]" : ""}`}>
                {canEdit && <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="h-4 w-4" /></td>}
                <td className="px-4 py-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-[#DADDE6] bg-[#EDEFF9]">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#6B7183]">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-[#0B0E1A]">{p.name}</td>
                <td className="px-4 py-3 text-[#4A5060]">{p.category_name ?? "-"}</td>
                <td className="px-4 py-3 text-[#4A5060]">{p.brand_name ?? "-"}</td>
                <td className="px-4 py-3">
                  {p.is_published_to_website ? (
                    <span className="rounded-full bg-[#16803C]/15 px-2 py-0.5 text-xs font-semibold text-[#16803C]">Published</span>
                  ) : (
                    <span className="rounded-full bg-[#EDEFF9] px-2 py-0.5 text-xs font-semibold text-[#4A5060]">Not published</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <table className="w-full text-xs">
                    <tbody>
                      {p.variants.map((v) => (
                        <tr key={v.id}>
                          <td className="pr-3 py-0.5">{v.variant_name}</td>
                          <td className="pr-3 py-0.5 text-[#4A5060]">{v.sku}</td>
                          <td className="pr-3 py-0.5 text-[#4A5060]">{v.barcode ?? ""}</td>
                          <td className="pr-3 py-0.5 text-right font-medium">{cedi(v.selling_price)}</td>
                          <td className="py-0.5 text-right">
                            {canAdjustStock && branchId !== null ? (
                              <button
                                onClick={() => openStockEdit(p, v)}
                                className="rounded-full px-1.5 py-0.5 font-semibold text-[#061161] hover:bg-[#EDEFF9]"
                                title={`Edit stock at ${branches.find((b) => b.id === branchId)?.name ?? "branch"}`}
                              >
                                {v.stock_quantity !== null && v.stock_quantity !== undefined
                                  ? `${parseFloat(v.stock_quantity)} ${v.unit}`
                                  : "-"}
                              </button>
                            ) : (
                              <span className="font-medium text-[#4A5060]">
                                {v.stock_quantity !== null && v.stock_quantity !== undefined
                                  ? `${parseFloat(v.stock_quantity)} ${v.unit}`
                                  : "-"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right align-top">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded border border-[#DADDE6] px-3 py-1.5 text-xs font-medium text-[#0B0E1A] hover:bg-[#FAFAFC]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ ids: [p.id], label: p.name })}
                      className="ml-2 rounded border border-[#C62828]/30 px-3 py-1.5 text-xs font-medium text-[#C62828] hover:bg-[#C62828]/10"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 6} className="px-4 py-10 text-center text-[#6B7183]">No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#0B0E1A]">Delete {confirmDelete.label}?</h2>
            <p className="mt-2 text-sm text-[#4A5060]">Products that were never sold, bought or transferred are removed for good, along with their stock records. Any product with sales or purchase history is archived instead, so your reports stay correct.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-[#DADDE6] px-4 py-2 text-sm font-semibold">Cancel</button>
              <button onClick={runDelete} disabled={bulkBusy} className="rounded-lg bg-[#C62828] px-4 py-2 text-sm font-bold text-white hover:bg-[#A32020] disabled:opacity-50">{bulkBusy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
      {data && pages > 1 && (
        <Pagination
          page={page}
          pages={pages}
          onPage={(p) => { setPage(p); load(search, p, branchId); }}
        />
      )}

      {/* Stock edit modal, edit value, then confirm before saving */}
      {editVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#DADDE6] bg-white p-6 shadow-xl">
            {!confirming ? (
              <>
                <h2 className="mb-1 text-lg font-semibold text-[#0B0E1A]">Edit Stock</h2>
                <p className="mb-4 text-sm text-[#4A5060]">
                  {editVariant.product.name}, {editVariant.variant.variant_name}
                  {" · "}{branches.find((b) => b.id === branchId)?.name}
                </p>
                {editError && (
                  <div className="mb-3 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{editError}</div>
                )}
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-[#4A5060]">Current stock</span>
                  <span className="font-semibold text-[#0B0E1A]">
                    {parseFloat(editVariant.variant.stock_quantity ?? "0")} {editVariant.variant.unit}
                  </span>
                </div>
                <label className="mb-1 block text-xs font-semibold text-[#4A5060]">New quantity ({editVariant.variant.unit})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  autoFocus
                  className="mb-4 w-full rounded-xl border border-[#DADDE6] px-3 py-2 text-sm focus:border-[#061161] focus:outline-none focus:ring-2 focus:ring-[#061161]/20"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newQty = parseFloat(editQty);
                      if (isNaN(newQty) || newQty < 0) {
                        setEditError("Enter a valid quantity (0 or more)");
                        return;
                      }
                      setEditError(null);
                      setConfirming(true);
                    }}
                    className="flex-1 rounded-xl bg-[#061161] py-2 text-sm font-medium text-white hover:bg-[#0A1C8C]"
                  >
                    Update Stock
                  </button>
                  <button
                    onClick={() => setEditVariant(null)}
                    className="rounded-xl border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#4A5060] hover:bg-[#FAFAFC]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-semibold text-[#0B0E1A]">Confirm stock update?</h2>
                <p className="mb-1 text-sm text-[#4A5060]">
                  {editVariant.product.name}, {editVariant.variant.variant_name}
                </p>
                <p className="mb-5 text-sm text-[#4A5060]">
                  Stock at <span className="font-medium">{branches.find((b) => b.id === branchId)?.name}</span> will change from{" "}
                  <span className="font-semibold text-[#0B0E1A]">{parseFloat(editVariant.variant.stock_quantity ?? "0")}</span> to{" "}
                  <span className="font-semibold text-[#061161]">{parseFloat(editQty)} {editVariant.variant.unit}</span>
                </p>
                {editError && (
                  <div className="mb-3 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{editError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveStockEdit}
                    disabled={editBusy}
                    className="flex-1 rounded-xl bg-[#061161] py-2 text-sm font-medium text-white hover:bg-[#0A1C8C] disabled:opacity-50"
                  >
                    {editBusy ? "Updating..." : "Yes, update stock"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-xl border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#4A5060] hover:bg-[#FAFAFC]"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit product modal, product fields, variant editing, and restock */}
      {editProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#DADDE6] bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#DADDE6] bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-[#0B0E1A]">Edit Product</h2>
              <button onClick={() => setEditProduct(null)} className="text-[#6B7183] hover:text-[#4A5060]">
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {eError && (
                <div className="mb-4 rounded border border-[#C62828]/30 bg-[#C62828]/10 px-3 py-2 text-sm text-[#C62828]">{eError}</div>
              )}

              {/* Product fields */}
              <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
                <Field label="Product Name *">
                  <input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm" />
                </Field>
                <Field label="Category">
                  <select value={eCategory ?? ""} onChange={(e) => setECategory(e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                    <option value="">None</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Brand">
                  <select value={eBrand ?? ""} onChange={(e) => setEBrand(e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm">
                    <option value="">None</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </div>

              {/* Image picker with preview */}
              <div className="mb-5">
                <Field label="Product Image">
                  <ImagePicker
                    value={eImage}
                    onChange={setEImage}
                    onError={(m) => setEError(m)}
                  />
                </Field>
              </div>

              {/* Extra website images, optional, max 5, each with a label */}
              <div className="mb-5">
                <Field label="Website Sub-Images (optional, e.g. different glow colours, cable colours)">
                  <MultiImagePicker value={eExtraImages} onChange={setEExtraImages} onError={(m) => setEError(m)} />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-[#DADDE6] px-3 py-2 text-sm"
                />
              </Field>

              <div className="mt-4 flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-[#0B0E1A]">
                  <input type="checkbox" checked={ePublish} onChange={(e) => setEPublish(e.target.checked)} className="h-4 w-4 rounded border-[#DADDE6] text-[#061161] focus:ring-[#061161]" />
                  Publish to website
                </label>
                <label className="flex items-center gap-2 text-sm text-[#0B0E1A]">
                  <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} className="h-4 w-4 rounded border-[#DADDE6] text-[#061161] focus:ring-[#061161]" />
                  Active (sellable)
                </label>
              </div>

              {/* Variants */}
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold uppercase text-[#4A5060]">Variants &amp; Prices</h3>
                <div className="overflow-x-auto rounded border border-[#DADDE6]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FAFAFC] text-left text-xs uppercase text-[#4A5060]">
                      <tr>
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Barcode</th>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2 text-right">Cost ₵</th>
                        <th className="px-3 py-2 text-right">Price ₵</th>
                        <th className="px-3 py-2 text-right">Reorder</th>
                        <th className="px-3 py-2 text-right">Stock</th>
                        <th className="px-3 py-2 text-center">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eVariants.map((v) => (
                        <tr key={v.id} className="border-t border-[#DADDE6]">
                          <td className="px-3 py-2">
                            <input
                              value={v.variant_name}
                              onChange={(e) => updateEVariant(v.id, "variant_name", e.target.value)}
                              className="w-36 rounded border border-[#DADDE6] px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-[#4A5060]" title="SKU cannot be changed">{v.sku}</td>
                          <td className="px-3 py-2">
                            <input
                              value={v.barcode ?? ""}
                              onChange={(e) => updateEVariant(v.id, "barcode", e.target.value)}
                              className="w-28 rounded border border-[#DADDE6] px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={v.unit}
                              onChange={(e) => updateEVariant(v.id, "unit", e.target.value)}
                              className="rounded border border-[#DADDE6] px-2 py-1 text-sm"
                            >
                              <option value="pcs">pcs</option>
                              <option value="box">box</option>
                              <option value="roll">roll</option>
                              <option value="m">m</option>
                              <option value="kg">kg</option>
                              <option value="set">set</option>
                              <option value="pack">pack</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" step="0.01" min="0"
                              value={v.cost_price ?? ""}
                              onChange={(e) => updateEVariant(v.id, "cost_price", e.target.value)}
                              className="w-20 rounded border border-[#DADDE6] px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" step="0.01" min="0"
                              value={v.selling_price}
                              onChange={(e) => updateEVariant(v.id, "selling_price", e.target.value)}
                              className="w-20 rounded border border-[#DADDE6] px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" step="1" min="0"
                              value={v.reorder_level}
                              onChange={(e) => updateEVariant(v.id, "reorder_level", e.target.value)}
                              className="w-16 rounded border border-[#DADDE6] px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canAdjustStock && branchId !== null ? (
                              <button
                                onClick={() => {
                                  const prod = editProduct;
                                  const orig = prod.variants.find((x) => x.id === v.id);
                                  if (orig) { setEditProduct(null); openStockEdit(prod, orig); }
                                }}
                                className="rounded-full px-1.5 py-0.5 font-semibold text-[#061161] hover:bg-[#EDEFF9]"
                                title="Restock / adjust quantity"
                              >
                                {v.stock_quantity !== null && v.stock_quantity !== undefined
                                  ? `${parseFloat(v.stock_quantity)} ${v.unit}`
                                  : "Restock"}
                              </button>
                            ) : (
                              <span className="text-[#4A5060]">
                                {v.stock_quantity !== null && v.stock_quantity !== undefined
                                  ? `${parseFloat(v.stock_quantity)} ${v.unit}`
                                  : "-"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={v.is_active}
                              onChange={(e) => updateEVariant(v.id, "is_active", e.target.checked)}
                              className="h-4 w-4 rounded border-[#DADDE6] text-[#061161]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-[#6B7183]">
                  Tip: click a stock number to restock, the change is confirmed and recorded in inventory movements.
                </p>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={eBusy}
                  className="rounded-xl bg-[#061161] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A1C8C] disabled:opacity-50"
                >
                  {eBusy ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditProduct(null)}
                  className="rounded-xl border border-[#DADDE6] px-4 py-2 text-sm font-medium text-[#4A5060] hover:bg-[#FAFAFC]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function getSuggestedAttrs(categoryName: string): string[] {
  const lower = categoryName.toLowerCase();
  if (lower.includes("light") || lower.includes("bulb") || lower.includes("lamp"))
    return ["Wattage", "Colour", "Base", "Voltage"];
  if (lower.includes("cable") || lower.includes("wire") || lower.includes("cord"))
    return ["Gauge", "Length", "Colour", "Core"];
  if (lower.includes("switch") || lower.includes("socket") || lower.includes("outlet"))
    return ["Type", "Gang", "Voltage", "Colour"];
  if (lower.includes("breaker") || lower.includes("mcb") || lower.includes("rcd"))
    return ["Amperage", "Poles", "Voltage", "Type"];
  if (lower.includes("battery") || lower.includes("inverter") || lower.includes("solar"))
    return ["Capacity", "Voltage", "Type"];
  return ["Wattage", "Colour", "Size", "Voltage", "Material"];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#0B0E1A]">{label}</span>
      {children}
    </label>
  );
}

