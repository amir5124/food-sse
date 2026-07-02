const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────────────────────────
const UWARUNG_COMPONENT_UID = '618b7f0c383e4';  // UWarung - daftar toko
const MAKANAN_COMPONENT_UID = '618637dbc8415';  // Jastip Makanan - daftar toko
const CODENAME = 'iknlinku';
const BATCH_SIZE = 3; // jumlah toko per batch SSE

// Default koordinat (Sepaku, Kalimantan Timur)
const defaultCoords = { lat: -0.975, lng: 116.786 };

// ─────────────────────────────────────────────────────────────
// UTILITAS
// ─────────────────────────────────────────────────────────────

/** Hitung jarak haversine (km) */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parse koordinat dari query string */
function parseUserCoords(query) {
    const lat = parseFloat(query.lat);
    const lng = parseFloat(query.lng);
    return (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : defaultCoords;
}

/** Helper header default untuk request ke Jagel */
const jagelHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://app.linku.co.id',
    'Referer': 'https://app.linku.co.id/',
    'Accept': 'application/json',
    'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImZmM2I0Njk4YWZiZDc0NmY4NDc5NmJkMjUyMGFjY2JlY2I2Mjg2ZWY4MDEwYzI0MTI5NDJiZjZiZTZhMmUwM2FhYzgyNzEwYTZiOTdlZDUxIn0.eyJhdWQiOiIxIiwianRpIjoiZmYzYjQ2OThhZmJkNzQ2Zjg0Nzk2YmQyNTIwYWNjYmVjYjYyODZlZjgwMTBjMjQxMjk0MmJmNmJlNmEyZTAzYWFjODI3MTBhNmI5N2VkNTEiLCJpYXQiOjE3ODI3MzI3OTEsIm5iZiI6MTc4MjczMjc5MSwiZXhwIjoxODE0MjY4NzkxLCJzdWIiOiIyOTcxODQ0Iiwic2NvcGVzIjpbXX0.C_jRz3EjjNjn9oJ-Ka1ksFXfGvgVZOlav4flxr2afeGY_CnR0Hn3RrC2tan1ofRynFqj__jolJ5aGHxt3VI5y3occNTDPjmVydVW0h2yDRUxv_q9FY3QsHPs9MsntJf3e8U0uquPLeMTN1bQrJrSz-kslmMGb4BllB8oQz3462K3dn4zrtW8tndIL1kJoPd_yEnIcUSxM9mMubdwbPFtrlhnHuBK91XRdVIt61NC4GN5Vl2sxfexaX4dfr02vRGswFnEA05DvAct1WOZcJ0YQt30gF_htyqDtH_5eGOBZfF00ZcG1QRKnbzfj-syPoC3_upipBKNd9VoswUHSAMQwgFlX-06PuxiQSFJJs2pUxDI00fTY73SKrINX_tO5qutEx5I2J5LxtwKMP0H5eMBLe6wcjDoUl32W8UBwR_bJAG96v2762ka37KHATrQ6ygsDubPDZVAtTdl_wB7mmwCQ8IR2_bL8vXzGplacc_x0hHZVeCGGCDRaeukUrl6Z_FRWmyT7Dl15rbPqiiJ6PUWtBsMuBBXQ7k4E1JGELBukNOlaaXbWNSJk_Qa7BstOEAwRmupt3KSlVYfQKnO2e7JDO78QHC9TPzsgEza25eu_q6ukbjiKanmDdRu-7MUOo95FRajAmRyOr3fIJ6-2zqEHTMNRlq7qEUyJMvTJXnQan4' // token lengkap
};

/** Bagi array menjadi chunk ukuran n */
function chunk(arr, n) {
    const result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
}

// ─────────────────────────────────────────────────────────────
// FUNGSI FETCH DATA DARI JAGEL
// ─────────────────────────────────────────────────────────────

/** Ambil semua toko dari component (pagination otomatis) */
async function fetchAllStoresFromComponent(componentUid) {
    let all = [], page = 1, lastPage = 1;
    do {
        const url = `https://app.jagel.id/api/v2/customer/component/${componentUid}`
            + `?codename=${CODENAME}&page=${page}&app_mode=1&per_page=24`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) throw new Error(`Component API error (uid=${componentUid})`);
        const lists = data.data.lists;
        all.push(...(lists.data || []));
        lastPage = lists.last_page;
        page++;
    } while (page <= lastPage);
    return all;
}

/** Ambil detail satu toko (berisi origin_address, rating, dll.) */
async function fetchStoreDetail(viewUid) {
    const url = `https://app.jagel.id/api/v2/customer/list/${viewUid}?codename=${CODENAME}`;
    const { data } = await axios.get(url, { headers: jagelHeaders });
    if (!data.success) throw new Error(`Detail API error for ${viewUid}`);
    return data.data;
}

/** Ambil children dari suatu list (kategori atau produk) */
async function fetchChildren(parentUid, page = 1, perPage = 100) {
    try {
        const url = `https://app.jagel.id/api/v2/customer/list/${parentUid}/children`
            + `?codename=${CODENAME}&page=${page}&per_page=${perPage}`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) return { items: [], lastPage: 1 };
        return {
            items: data.data.data || [],
            lastPage: data.data.last_page || 1
        };
    } catch (err) {
        console.log(`⚠️  Fetch children ${parentUid}: ${err.message}`);
        return { items: [], lastPage: 1 };
    }
}

/** Ambil semua kategori dari toko (children type=4) */
async function fetchStoreCategories(viewUid) {
    let allCategories = [], page = 1, lastPage = 1;
    do {
        const { items, lastPage: lp } = await fetchChildren(viewUid, page, 100);
        allCategories.push(...items.filter(item => item.type === 4));
        lastPage = lp;
        page++;
    } while (page <= lastPage);

    if (allCategories.length > 0) {
        console.log(`📦 Store ${viewUid}: ${allCategories.length} kategori`);
    }
    return allCategories;
}

/** Ambil semua produk dari suatu kategori (type=0 atau purchasable=1) */
async function fetchCategoryProducts(categoryUid) {
    let allProducts = [], page = 1, lastPage = 1;
    do {
        const { items, lastPage: lp } = await fetchChildren(categoryUid, page, 100);
        allProducts.push(...items.filter(item => item.type === 0 || item.purchasable === 1));
        lastPage = lp;
        page++;
    } while (page <= lastPage);
    return allProducts;
}

/** Ambil semua produk dari satu toko via kategori */
async function fetchStoreProductsWithCategories(viewUid) {
    try {
        const categories = await fetchStoreCategories(viewUid);
        const allProducts = [];

        for (const category of categories) {
            const products = await fetchCategoryProducts(category.view_uid);
            products.forEach(p => {
                p.category_name = category.title;
                p.category_uid = category.view_uid;
            });
            allProducts.push(...products);
            if (products.length > 0) {
                console.log(`   - ${category.title}: ${products.length} produk`);
            }
        }

        // Jika tidak ada kategori, coba langsung dari toko
        if (categories.length === 0) {
            console.log(`   ⚠️ Tidak ada kategori, ambil produk langsung dari toko...`);
            const direct = await fetchCategoryProducts(viewUid);
            direct.forEach(p => {
                p.category_name = 'Menu Utama';
                p.category_uid = 'main';
            });
            allProducts.push(...direct);
            if (direct.length > 0) {
                console.log(`   - Langsung: ${direct.length} produk`);
            }
        }

        return allProducts;
    } catch (err) {
        console.log(`⚠️  Produk ${viewUid}: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// 🔥 FUNGSI GET DISCOUNT / PROMO
// ─────────────────────────────────────────────────────────────

// Tambah di atas server.js
// Ganti cache sederhana dengan TTL cache
const discountCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit — sesuaikan kebutuhan

async function fetchDiscounts(uniqueId, filter = 2) {
    const cacheKey = `${uniqueId}_${filter}`;

    // ✅ Cek cache + TTL
    if (discountCache[cacheKey]) {
        const { data, cachedAt } = discountCache[cacheKey];
        const age = Date.now() - cachedAt;

        if (age < CACHE_TTL_MS) {
            console.log(`📦 Cache hit [${cacheKey}] — umur: ${Math.round(age / 1000)}s`);
            return data;
        } else {
            console.log(`⏰ Cache expired [${cacheKey}] — umur: ${Math.round(age / 1000)}s, refetch...`);
            delete discountCache[cacheKey];
        }
    }

    try {
        if (!uniqueId) return null;
        const url = `https://app.jagel.id/api/mydiscount?filter=${filter}&unique_id=${uniqueId}`;
        console.log(`🌐 Fetching discounts for unique_id=${uniqueId}, filter=${filter}`);

        const response = await axios.get(url, { headers: jagelHeaders });

        if (response.data?.success) {
            // ✅ Simpan dengan timestamp
            discountCache[cacheKey] = {
                data: response.data.data,
                cachedAt: Date.now()
            };
            console.log(`✅ Fetched ${response.data.data?.discounts?.length || 0} discounts → cached`);
            return response.data.data;
        }
        return null;
    } catch (err) {
        console.log(`⚠️ Failed to fetch discounts: ${err.message}`);
        return null;
    }
}

// ✅ Auto clear cache yang expired setiap 10 menit
setInterval(() => {
    const now = Date.now();
    let cleared = 0;
    Object.keys(discountCache).forEach(key => {
        if (now - discountCache[key].cachedAt > CACHE_TTL_MS) {
            delete discountCache[key];
            cleared++;
        }
    });
    if (cleared > 0) console.log(`🗑️ Auto clear cache: ${cleared} entries expired`);
}, 10 * 60 * 1000);



/** Ambil diskon/promo berdasarkan partner_view_uid */
async function fetchDiscountsByPartner(partnerViewUid, filter = 2) {
    try {
        if (!partnerViewUid) {
            console.log('⚠️  partner_view_uid is required for fetching discounts by partner');
            return null;
        }

        // Coba cari unique_id dari partner_view_uid terlebih dahulu
        const partnerUrl = `https://app.jagel.id/api/users/${partnerViewUid}?driver=1`;
        console.log(`🌐 Fetching partner info for view_uid=${partnerViewUid}`);

        const partnerResponse = await axios.get(partnerUrl, { headers: jagelHeaders });

        if (partnerResponse.data && partnerResponse.data.success && partnerResponse.data.data) {
            const uniqueId = partnerResponse.data.data.unique_id;
            if (uniqueId) {
                console.log(`✅ Found unique_id=${uniqueId} for partner ${partnerViewUid}`);
                return await fetchDiscounts(uniqueId, filter);
            }
        }
        return null;
    } catch (err) {
        console.log(`⚠️ Failed to fetch discounts by partner: ${err.message}`);
        return null;
    }
}

/** Match diskon dengan list produk/toko */
function matchDiscountsWithItems(discounts, items, type = 'products') {
    if (!discounts || !discounts.discounts || discounts.discounts.length === 0) {
        return { items, total_discounts: 0 };
    }

    const discountMap = {};

    // Buat mapping diskon berdasarkan partner_view_uid
    discounts.discounts.forEach(discount => {
        if (discount.partner_view_uid) {
            if (!discountMap[discount.partner_view_uid]) {
                discountMap[discount.partner_view_uid] = [];
            }
            discountMap[discount.partner_view_uid].push(discount);
        }
    });

    // Match dengan items
    const matchedItems = items.map(item => {
        const partnerViewUid = item.partner_view_uid || item.store_partner_view_uid || null;

        if (partnerViewUid && discountMap[partnerViewUid]) {
            return {
                ...item,
                discounts: discountMap[partnerViewUid],
                has_discount: true,
                discount_count: discountMap[partnerViewUid].length
            };
        }

        return {
            ...item,
            discounts: [],
            has_discount: false,
            discount_count: 0
        };
    });

    return {
        items: matchedItems,
        total_discounts: discounts.discounts.length,
        matched_items: matchedItems.filter(i => i.has_discount).length
    };
}

// ─────────────────────────────────────────────────────────────
// BATCH PROCESSOR
// ─────────────────────────────────────────────────────────────

/** Proses batch toko → data toko */
async function processBatchStores(storeList, userCoords) {
    return Promise.all(storeList.map(async (store) => {
        try {
            const detail = await fetchStoreDetail(store.view_uid);
            const distance = (detail.origin_lat && detail.origin_lng)
                ? getDistance(userCoords.lat, userCoords.lng,
                    parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                : null;

            return {
                ok: true,
                data: {
                    view_uid: store.view_uid,
                    title: store.title,
                    image: store.image,
                    content: detail.content || '',
                    is_open: detail.is_open,
                    close_status: detail.close_status || '',
                    close_time: detail.close_time || '',
                    origin_address: detail.origin_address || '',
                    origin_lat: detail.origin_lat,
                    origin_lng: detail.origin_lng,
                    link_view: store.link_view,
                    distance,
                    seller_rating: detail.seller_rating,
                    partner_view_uid: detail.partner_view_uid || null
                }
            };
        } catch (err) {
            return { ok: false, store_title: store.title, error: err.message };
        }
    }));
}

/** Proses batch toko → data produk */
async function processBatchProducts(storeList, userCoords) {
    return Promise.all(storeList.map(async (store) => {
        try {
            const detail = await fetchStoreDetail(store.view_uid);
            const distance = (detail.origin_lat && detail.origin_lng)
                ? getDistance(userCoords.lat, userCoords.lng,
                    parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
                : null;

            const products = await fetchStoreProductsWithCategories(store.view_uid);

            const productList = products.map(p => ({
                product_view_uid: p.view_uid,
                product_title: p.title,
                product_image: p.image,
                product_price: p.price || 0,
                product_content: p.content || '',
                product_category: p.category_name || '',
                product_has_variants: !!(p.list_product_variant && p.list_product_variant.length > 0),
                store_view_uid: store.view_uid,
                store_title: store.title,
                store_image: store.image,
                store_origin_address: detail.origin_address || '',
                store_origin_lat: detail.origin_lat,
                store_origin_lng: detail.origin_lng,
                store_distance: distance,
                store_rating: detail.seller_rating,
                store_is_open: detail.is_open,
                link_view: store.link_view,
                partner_view_uid: detail.partner_view_uid || null
            }));

            return { ok: true, store_title: store.title, data: productList, count: productList.length };
        } catch (err) {
            return { ok: false, store_title: store.title, error: err.message };
        }
    }));
}

// ─────────────────────────────────────────────────────────────
// HELPER SSE
// ─────────────────────────────────────────────────────────────

function setupSSE(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    return (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    };
}

// ─────────────────────────────────────────────────────────────
// SSE: /api/stores-stream?source=uwarung|makanan&lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/stores-stream', async (req, res) => {
    const send = setupSSE(res);
    req.on('close', () => res.end());

    try {
        const userCoords = parseUserCoords(req.query);
        const source = req.query.source === 'makanan' ? 'makanan' : 'uwarung';
        const uid = source === 'makanan' ? MAKANAN_COMPONENT_UID : UWARUNG_COMPONENT_UID;

        console.log(`📡 [stores-stream] source=${source}`);

        const stores = await fetchAllStoresFromComponent(uid);
        const batches = chunk(stores, BATCH_SIZE);

        send('meta', {
            total_stores: stores.length,
            total_batches: batches.length,
            batch_size: BATCH_SIZE,
            source,
            userCoords
        });

        let processedCount = 0;

        for (let bi = 0; bi < batches.length; bi++) {
            const results = await processBatchStores(batches[bi], userCoords);
            const successItems = results.filter(r => r.ok).map(r => r.data);
            const failedItems = results.filter(r => !r.ok);

            if (successItems.length > 0) {
                send('batch_stores', {
                    batch_index: bi + 1,
                    total_batches: batches.length,
                    stores: successItems
                });
            }

            failedItems.forEach(f => send('error_store', { store_name: f.store_title, error: f.error }));

            processedCount += batches[bi].length;
            send('progress', {
                batch_index: bi + 1,
                total_batches: batches.length,
                processed_stores: processedCount,
                total_stores: stores.length,
                percent: Math.round((processedCount / stores.length) * 100)
            });

            console.log(`✅ [stores-stream] batch ${bi + 1}/${batches.length} — ${successItems.length} toko`);
        }

        send('done', { total_stores: stores.length, total_batches: batches.length, source });
        res.end();

    } catch (err) {
        console.error('❌ [stores-stream]', err.message);
        send('error', { message: err.message });
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// SSE: /api/products-stream?source=uwarung|makanan&lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/products-stream', async (req, res) => {
    const send = setupSSE(res);
    req.on('close', () => res.end());

    try {
        const userCoords = parseUserCoords(req.query);
        const source = req.query.source === 'makanan' ? 'makanan' : 'uwarung';
        const uid = source === 'makanan' ? MAKANAN_COMPONENT_UID : UWARUNG_COMPONENT_UID;

        console.log(`📡 [products-stream] source=${source} koordinat: ${userCoords.lat}, ${userCoords.lng}`);

        const stores = await fetchAllStoresFromComponent(uid);
        const batches = chunk(stores, BATCH_SIZE);

        send('meta', {
            total_stores: stores.length,
            total_batches: batches.length,
            batch_size: BATCH_SIZE,
            source,
            userCoords
        });

        let totalProducts = 0;
        let processedStores = 0;

        for (let bi = 0; bi < batches.length; bi++) {
            const results = await processBatchProducts(batches[bi], userCoords);
            const batchProducts = [];

            results.forEach(r => {
                if (r.ok) {
                    batchProducts.push(...r.data);
                    console.log(`  ✅ ${r.store_title} → ${r.count} produk`);
                } else {
                    send('error_store', { store_name: r.store_title, error: r.error });
                    console.log(`  ⚠️  ${r.store_title}: ${r.error}`);
                }
            });

            if (batchProducts.length > 0) {
                batchProducts.sort((a, b) => (a.store_distance ?? Infinity) - (b.store_distance ?? Infinity));
                send('batch_products', {
                    batch_index: bi + 1,
                    total_batches: batches.length,
                    products: batchProducts,
                    count: batchProducts.length
                });
                totalProducts += batchProducts.length;
            }

            processedStores += batches[bi].length;
            send('progress', {
                batch_index: bi + 1,
                total_batches: batches.length,
                processed_stores: processedStores,
                total_stores: stores.length,
                total_products_so_far: totalProducts,
                percent: Math.round((processedStores / stores.length) * 100)
            });

            console.log(`✅ [products-stream] batch ${bi + 1}/${batches.length} — ${batchProducts.length} produk`);
        }

        send('done', { total_products: totalProducts, total_stores: stores.length, total_batches: batches.length, source });
        res.end();

    } catch (err) {
        console.error('❌ [products-stream]', err.message);
        send('error', { message: err.message });
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// SSE: /api/store/:viewUid/menu-stream?lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/store/:viewUid/menu-stream', async (req, res) => {
    const send = setupSSE(res);
    req.on('close', () => res.end());

    try {
        const { viewUid } = req.params;
        const userCoords = parseUserCoords(req.query);

        console.log(`📡 [menu-stream] store=${viewUid}`);

        const storeDetail = await fetchStoreDetail(viewUid);
        const categories = await fetchStoreCategories(viewUid);

        send('meta', {
            total_categories: categories.length,
            store_name: storeDetail.title,
            store_uid: viewUid
        });

        let totalProducts = 0;

        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const products = await fetchCategoryProducts(category.view_uid);

            const distance = (storeDetail.origin_lat && storeDetail.origin_lng)
                ? getDistance(userCoords.lat, userCoords.lng,
                    parseFloat(storeDetail.origin_lat), parseFloat(storeDetail.origin_lng))
                : null;

            const formatted = products.map(p => ({
                view_uid: p.view_uid,
                title: p.title,
                image: p.image,
                price: p.price || 0,
                content: p.content || '',
                category_name: category.title,
                store_distance: distance,
                has_variants: !!(p.list_product_variant && p.list_product_variant.length > 0),
                variants: p.list_product_variant || []
            }));

            totalProducts += formatted.length;

            send('category', {
                category_index: i + 1,
                total_categories: categories.length,
                category: {
                    view_uid: category.view_uid,
                    title: category.title,
                    products: formatted
                }
            });

            send('progress', {
                percent: Math.round(((i + 1) / categories.length) * 100),
                current: i + 1,
                total: categories.length,
                products_loaded: totalProducts
            });

            console.log(`   ✅ ${category.title}: ${formatted.length} produk`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        send('done', { total_categories: categories.length, total_products: totalProducts });
        res.end();

    } catch (err) {
        console.error('❌ [menu-stream]', err.message);
        send('error', { message: err.message });
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/stores?source=uwarung|makanan&lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/stores', async (req, res) => {
    try {
        const userCoords = parseUserCoords(req.query);
        const source = req.query.source === 'makanan' ? 'makanan' : 'uwarung';
        const uid = source === 'makanan' ? MAKANAN_COMPONENT_UID : UWARUNG_COMPONENT_UID;

        const stores = await fetchAllStoresFromComponent(uid);
        const results = await processBatchStores(stores, userCoords);
        const list = results.filter(r => r.ok).map(r => r.data);
        list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        res.json({ success: true, total_stores: list.length, stores: list, source, userCoords });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/products?source=uwarung|makanan&lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
    try {
        const userCoords = parseUserCoords(req.query);
        const source = req.query.source === 'makanan' ? 'makanan' : 'uwarung';
        const uid = source === 'makanan' ? MAKANAN_COMPONENT_UID : UWARUNG_COMPONENT_UID;

        const stores = await fetchAllStoresFromComponent(uid);
        const results = await processBatchProducts(stores, userCoords);
        const allProducts = results.flatMap(r => r.ok ? r.data : []);
        allProducts.sort((a, b) => (a.store_distance ?? Infinity) - (b.store_distance ?? Infinity));

        res.json({
            success: true,
            total_products: allProducts.length,
            total_stores: stores.length,
            products: allProducts,
            source,
            userCoords
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/store/:viewUid — detail toko
// ─────────────────────────────────────────────────────────────
app.get('/api/store/:viewUid', async (req, res) => {
    try {
        const detail = await fetchStoreDetail(req.params.viewUid);
        res.json({
            success: true,
            store: {
                view_uid: detail.view_uid,
                title: detail.title,
                content: detail.content,
                image: detail.image,
                origin_address: detail.origin_address || '',
                origin_lat: detail.origin_lat,
                origin_lng: detail.origin_lng,
                is_open: detail.is_open,
                close_status: detail.close_status,
                working_hour: detail.working_hour,
                seller_rating: detail.seller_rating,
                price: detail.price,
                weight: detail.weight,
                expedition: detail.expedition,
                max_distance: detail.max_distance,
                partner_view_uid: detail.partner_view_uid || null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/store/:viewUid/products?lat=&lng=
// ─────────────────────────────────────────────────────────────
app.get('/api/store/:viewUid/products', async (req, res) => {
    const { viewUid } = req.params;
    const userCoords = parseUserCoords(req.query);

    // Setup SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // biar nginx ga buffer
    });

    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // kirim heartbeat biar koneksi ga ke-close proxy/load balancer
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
    });

    try {
        console.log(`📦 [store-products-stream] store=${viewUid}`);

        const [detail, categories] = await Promise.all([
            fetchStoreDetail(viewUid),
            fetchStoreCategories(viewUid)
        ]);

        const distance = (detail.origin_lat && detail.origin_lng)
            ? getDistance(userCoords.lat, userCoords.lng,
                parseFloat(detail.origin_lat), parseFloat(detail.origin_lng))
            : null;

        const storeInfo = {
            view_uid: detail.view_uid,
            title: detail.title,
            image: detail.image,
            origin_address: detail.origin_address || '',
            origin_lat: detail.origin_lat,
            origin_lng: detail.origin_lng,
            is_open: detail.is_open === 1,
            seller_rating: detail.seller_rating,
            partner_view_uid: detail.partner_view_uid || null
        };

        // kirim info store + total kategori duluan, biar client bisa render skeleton
        send('store_info', {
            store: storeInfo,
            total_categories: categories.length,
            userCoords
        });

        const mapProduct = (p, categoryTitle) => {
            let variants = [];
            let displayPrice = p.price || 0;
            if (p.list_product_variant && p.list_product_variant.length > 0) {
                variants = p.list_product_variant.map(v => ({
                    view_uid: v.view_uid,
                    name: v.name,
                    price: v.price || v.new_price || 0
                }));
                displayPrice = Math.min(...variants.map(v => v.price), displayPrice);
            }
            return {
                view_uid: p.view_uid,
                title: p.title,
                image: p.image,
                price: displayPrice,
                original_price: p.price_before_discount || p.price,
                content: p.content || '',
                product_category: categoryTitle,
                has_variants: variants.length > 0,
                variants,
                store_view_uid: detail.view_uid,
                store_title: detail.title,
                store_distance: distance,
                store_is_open: detail.is_open === 1,
                is_open: p.is_open === 1,
                max_qty: p.max_qty,
                partner_view_uid: detail.partner_view_uid || null
            };
        };

        let allProducts = [];
        let totalCategoriesSent = 0;

        // Fallback kalau tidak ada kategori sama sekali
        if (categories.length === 0) {
            const direct = await fetchCategoryProducts(viewUid);
            const mapped = direct.map(p => mapProduct(p, 'Menu Utama'));
            allProducts = mapped;

            send('batch', {
                categories: [{
                    name: 'Menu Utama',
                    products: mapped,
                    count: mapped.length
                }],
                batch_index: 0,
                is_last: true
            });

            send('done', {
                total_products: allProducts.length,
                total_categories: 1
            });
            clearInterval(heartbeat);
            res.end();
            return;
        }

        // Proses tiap kategori secara berurutan, tapi kirim per batch 3 kategori
        const BATCH_SIZE = 3;
        let buffer = []; // buffer kategori yg sudah siap kirim
        let batchIndex = 0;

        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const rawProducts = await fetchCategoryProducts(category.view_uid);

            if (rawProducts.length > 0) {
                console.log(`   - ${category.title}: ${rawProducts.length} produk`);
                const mapped = rawProducts.map(p => mapProduct(p, category.title));
                allProducts.push(...mapped);

                buffer.push({
                    name: category.title,
                    products: mapped,
                    count: mapped.length
                });
            }

            const isLastCategory = i === categories.length - 1;

            // begitu buffer udah 3 kategori ATAU ini kategori terakhir, langsung flush
            if (buffer.length >= BATCH_SIZE || (isLastCategory && buffer.length > 0)) {
                send('batch', {
                    categories: buffer,
                    batch_index: batchIndex++,
                    is_last: isLastCategory
                });
                buffer = [];
            }
        }

        send('done', {
            total_products: allProducts.length,
            total_categories: categories.length
        });

        clearInterval(heartbeat);
        res.end();

    } catch (err) {
        console.error('❌ [store-products-stream]', err.message);
        send('error', { success: false, error: err.message });
        clearInterval(heartbeat);
        res.end();
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/product/:viewUid — info lengkap produk
// ─────────────────────────────────────────────────────────────
app.get('/api/product/:viewUid', async (req, res) => {
    try {
        const url = `https://app.jagel.id/api/v2/customer/list/${req.params.viewUid}`
            + `?codename=${CODENAME}`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) throw new Error('Produk tidak ditemukan');
        const d = data.data;

        res.json({
            success: true,
            product: {
                view_uid: d.view_uid,
                title: d.title,
                content: d.content,
                price: d.price,
                price_before_discount: d.price_before_discount,
                discount_flag: d.discount_flag,
                image: d.image,
                image2: d.image2,
                image3: d.image3,
                image4: d.image4,
                image5: d.image5,
                is_open: d.is_open,
                expedition: d.expedition,      // "Kurir Food"
                max_distance: d.max_distance,    // km
                weight: d.weight,
                use_variant: d.use_variant,
                sold: d.sold,
                seen: d.seen,
                review_count: d.review_count,
                review_rating: d.review_rating,
                seller_rating: d.seller_rating,
                share_url: d.share,
                // Toko pemilik
                store: {
                    view_uid: d.app_view_uid,
                    title: d.app_name,
                    icon: d.app_icon,
                    parent_name: d.parent_name,
                    partner_uid: d.partner_view_uid,
                },
                // Lokasi asal
                origin: {
                    lat: d.origin_lat,
                    lng: d.origin_lng,
                    address: d.origin_address,
                }
            }
        });
    } catch (err) {
        console.error('❌ [product-info]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// JSON: /api/product/:viewUid/reviews — ulasan produk
// ─────────────────────────────────────────────────────────────
app.get('/api/product/:viewUid/reviews', async (req, res) => {
    try {
        const url = `https://app.jagel.id/api/v2/customer/list/${req.params.viewUid}`
            + `?codename=${CODENAME}`;
        const { data } = await axios.get(url, { headers: jagelHeaders });
        if (!data.success) throw new Error('Produk tidak ditemukan');
        const d = data.data;

        res.json({
            success: true,
            product_view_uid: d.view_uid,
            product_title: d.title,
            review_count: d.review_count,
            review_rating: d.review_rating,   // rata-rata rating (null jika belum ada)
            seller_rating: d.seller_rating,
            reviews: d.reviews ?? []    // array ulasan
        });
    } catch (err) {
        console.error('❌ [product-reviews]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// 🔥 ENDPOINT BARU: DISCOUNT / PROMO MATCHING
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/discounts
 * Endpoint untuk mendapatkan diskon/promo berdasarkan berbagai parameter
 * 
 * Query params:
 * - unique_id: (wajib) Unique ID user
 * - filter: (opsional) Filter diskon, default 2
 * - partner_view_uid: (opsional) View UID partner untuk filter diskon spesifik partner
 * - include_products: (opsional) true/false, untuk include produk yang ada diskon
 * - product_view_uid: (opsional) View UID produk spesifik untuk cek diskon
 * 
 * Contoh:
 * GET /api/discounts?unique_id=03421121304617f701ba3b374.23310242
 * GET /api/discounts?unique_id=03421121304617f701ba3b374.23310242&filter=2
 * GET /api/discounts?partner_view_uid=617f701ba3b3a
 * GET /api/discounts?unique_id=...&include_products=true
 * GET /api/discounts?unique_id=...&product_view_uid=617f701ba3b3a
 */
app.get('/api/discounts', async (req, res) => {
    try {
        const {
            unique_id,
            filter = 2,
            partner_view_uid,
            include_products = 'false',
            product_view_uid
        } = req.query;

        console.log('🔍 [DISCOUNTS] Request:', { unique_id, filter, partner_view_uid, include_products, product_view_uid });

        // Validasi: minimal unique_id atau partner_view_uid harus ada
        if (!unique_id && !partner_view_uid) {
            return res.status(400).json({
                success: false,
                error: "Either unique_id or partner_view_uid is required"
            });
        }

        let discountsData = null;
        let usedUniqueId = unique_id;

        // Jika partner_view_uid diberikan tapi unique_id tidak, cari unique_id dari partner
        if (partner_view_uid && !unique_id) {
            console.log(`🔍 Fetching discounts by partner_view_uid: ${partner_view_uid}`);
            discountsData = await fetchDiscountsByPartner(partner_view_uid, parseInt(filter));

            // Jika berhasil, ambil unique_id dari data
            if (discountsData && discountsData.unique_id) {
                usedUniqueId = discountsData.unique_id;
            }
        } else if (unique_id) {
            console.log(`🔍 Fetching discounts by unique_id: ${unique_id}`);
            discountsData = await fetchDiscounts(unique_id, parseInt(filter));
        }

        // Jika tidak ada data diskon
        if (!discountsData || !discountsData.discounts || discountsData.discounts.length === 0) {
            return res.json({
                success: true,
                data: {
                    unique_id: usedUniqueId || null,
                    discounts: [],
                    total_discounts: 0,
                    message: "No discounts found"
                }
            });
        }

        // Jika include_products = true, cari produk yang memiliki diskon
        let productsWithDiscounts = [];
        let matchedProducts = [];

        if (include_products === 'true' || product_view_uid) {
            console.log(`🔍 Fetching products with discounts...`);

            // Ambil semua toko dari kedua component
            const uwarungStores = await fetchAllStoresFromComponent(UWARUNG_COMPONENT_UID);
            const makananStores = await fetchAllStoresFromComponent(MAKANAN_COMPONENT_UID);
            const allStores = [...uwarungStores, ...makananStores];

            // Buat mapping store berdasarkan view_uid
            const storeMap = {};
            for (const store of allStores) {
                try {
                    const detail = await fetchStoreDetail(store.view_uid);
                    if (detail.partner_view_uid) {
                        storeMap[store.view_uid] = {
                            ...store,
                            partner_view_uid: detail.partner_view_uid,
                            origin_lat: detail.origin_lat,
                            origin_lng: detail.origin_lng,
                            origin_address: detail.origin_address,
                            is_open: detail.is_open,
                            seller_rating: detail.seller_rating
                        };
                    }
                } catch (err) {
                    console.log(`⚠️ Failed to fetch detail for store ${store.view_uid}`);
                }
            }

            // Buat mapping diskon berdasarkan partner_view_uid
            const discountMap = {};
            discountsData.discounts.forEach(discount => {
                if (discount.partner_view_uid) {
                    if (!discountMap[discount.partner_view_uid]) {
                        discountMap[discount.partner_view_uid] = [];
                    }
                    discountMap[discount.partner_view_uid].push(discount);
                }
            });

            // Cari produk dari store yang memiliki partner dengan diskon
            for (const storeUid in storeMap) {
                const store = storeMap[storeUid];
                const partnerUid = store.partner_view_uid;

                // Jika produk spesifik diminta, cari produk tersebut saja
                if (product_view_uid) {
                    try {
                        const productUrl = `https://app.jagel.id/api/v2/customer/list/${product_view_uid}?codename=${CODENAME}`;
                        const productRes = await axios.get(productUrl, { headers: jagelHeaders });
                        if (productRes.data.success) {
                            const product = productRes.data.data;
                            const storeDetail = await fetchStoreDetail(storeUid);

                            // Cek apakah produk ini punya diskon
                            let productDiscounts = [];
                            if (discountMap[partnerUid]) {
                                productDiscounts = discountMap[partnerUid];
                            }

                            if (productDiscounts.length > 0 || product.discount_flag === 1) {
                                matchedProducts.push({
                                    view_uid: product.view_uid,
                                    title: product.title,
                                    price: product.price || 0,
                                    original_price: product.price_before_discount || product.price,
                                    image: product.image,
                                    content: product.content || '',
                                    store_view_uid: storeUid,
                                    store_title: store.title,
                                    store_partner_view_uid: partnerUid,
                                    discounts: productDiscounts,
                                    has_discount: productDiscounts.length > 0 || product.discount_flag === 1,
                                    discount_count: productDiscounts.length,
                                    is_open: product.is_open === 1,
                                    max_qty: product.max_qty || null
                                });
                            }
                        }
                    } catch (err) {
                        console.log(`⚠️ Failed to fetch product ${product_view_uid}`);
                    }
                    break; // Hanya cari 1 produk spesifik
                }

                // Jika partner punya diskon
                if (discountMap[partnerUid]) {
                    try {
                        // Ambil produk dari store ini
                        const products = await fetchStoreProductsWithCategories(storeUid);

                        for (const product of products) {
                            // Cek apakah produk ini aktif dan memiliki diskon
                            if (product.is_open === 1) {
                                // Cek diskon dari partner
                                let productDiscounts = discountMap[partnerUid] || [];

                                // Filter diskon yang masih aktif
                                const now = new Date();
                                const activeDiscounts = productDiscounts.filter(d => {
                                    const endDate = new Date(d.end_date);
                                    return endDate > now;
                                });

                                if (activeDiscounts.length > 0 || product.discount_flag === 1) {
                                    matchedProducts.push({
                                        view_uid: product.view_uid,
                                        title: product.title,
                                        price: product.price || 0,
                                        original_price: product.price_before_discount || product.price,
                                        image: product.image,
                                        content: product.content || '',
                                        product_category: product.category_name || 'Menu Utama',
                                        store_view_uid: storeUid,
                                        store_title: store.title,
                                        store_partner_view_uid: partnerUid,
                                        discounts: activeDiscounts,
                                        has_discount: activeDiscounts.length > 0 || product.discount_flag === 1,
                                        discount_count: activeDiscounts.length,
                                        is_open: product.is_open === 1,
                                        max_qty: product.max_qty || null
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.log(`⚠️ Failed to fetch products for store ${storeUid}`);
                    }
                }
            }
        }

        // Response
        const responseData = {
            unique_id: usedUniqueId || discountsData.unique_id || null,
            discounts: discountsData.discounts || [],
            total_discounts: discountsData.discounts?.length || 0,
            user_info: {
                name: discountsData.name || null,
                view_uid: discountsData.view_uid || null,
                premium_flag: discountsData.premium_flag || 0,
                silver_flag: discountsData.silver_flag || 0,
                gold_flag: discountsData.gold_flag || 0,
                platinum_flag: discountsData.platinum_flag || 0
            }
        };

        // Tambahkan produk yang memiliki diskon jika diminta
        if (include_products === 'true' || product_view_uid) {
            responseData.products_with_discounts = matchedProducts;
            responseData.total_products_with_discounts = matchedProducts.length;
        }

        // Jika ada produk spesifik, tambahkan info produk
        if (product_view_uid && matchedProducts.length > 0) {
            responseData.specific_product = matchedProducts[0];
        }

        console.log(`✅ [DISCOUNTS] Success: ${responseData.total_discounts} discounts, ${matchedProducts.length} products with discounts`);

        res.json({
            success: true,
            data: responseData
        });

    } catch (err) {
        console.error('❌ [DISCOUNTS] Error:', err.message);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/discounts/check-product/:productViewUid
 * Endpoint untuk cek diskon spesifik produk
 * 
 * Query params:
 * - unique_id: (opsional) Unique ID user
 * - filter: (opsional) Filter diskon, default 2
 * 
 * Contoh:
 * GET /api/discounts/check-product/617f701ba3b3a?unique_id=03421121304617f701ba3b374.23310242
 */
app.get('/api/discounts/check-product/:productViewUid', async (req, res) => {
    try {
        const { productViewUid } = req.params;
        const { unique_id, filter = 2 } = req.query;

        if (!productViewUid) {
            return res.status(400).json({
                success: false,
                error: "productViewUid is required"
            });
        }

        // Ambil detail produk
        const productUrl = `https://app.jagel.id/api/v2/customer/list/${productViewUid}?codename=${CODENAME}`;
        const productRes = await axios.get(productUrl, { headers: jagelHeaders });

        if (!productRes.data.success) {
            return res.status(404).json({
                success: false,
                error: "Product not found"
            });
        }

        const product = productRes.data.data;
        const partnerViewUid = product.partner_view_uid || product.app_partner_view_uid;

        if (!partnerViewUid) {
            return res.json({
                success: true,
                data: {
                    product: {
                        view_uid: product.view_uid,
                        title: product.title,
                        price: product.price || 0
                    },
                    has_discount: false,
                    discounts: [],
                    message: "No partner found for this product"
                }
            });
        }

        // Cari diskon
        let discountsData = null;
        let usedUniqueId = unique_id;

        if (unique_id) {
            discountsData = await fetchDiscounts(unique_id, parseInt(filter));
        } else {
            discountsData = await fetchDiscountsByPartner(partnerViewUid, parseInt(filter));
            if (discountsData && discountsData.unique_id) {
                usedUniqueId = discountsData.unique_id;
            }
        }

        // Cari diskon yang cocok dengan partner produk
        let matchedDiscounts = [];
        if (discountsData && discountsData.discounts) {
            matchedDiscounts = discountsData.discounts.filter(d =>
                d.partner_view_uid === partnerViewUid
            );

            // Filter yang masih aktif
            const now = new Date();
            matchedDiscounts = matchedDiscounts.filter(d => {
                const endDate = new Date(d.end_date);
                return endDate > now;
            });
        }

        // Response
        res.json({
            success: true,
            data: {
                product: {
                    view_uid: product.view_uid,
                    title: product.title,
                    price: product.price || 0,
                    original_price: product.price_before_discount || product.price,
                    image: product.image,
                    content: product.content || '',
                    discount_flag: product.discount_flag || 0
                },
                partner: {
                    view_uid: partnerViewUid,
                    username: product.partner_username || null,
                    name: product.partner_name || null
                },
                user_unique_id: usedUniqueId || null,
                has_discount: matchedDiscounts.length > 0 || product.discount_flag === 1,
                discounts: matchedDiscounts,
                total_discounts: matchedDiscounts.length
            }
        });

    } catch (err) {
        console.error('❌ [DISCOUNTS/CHECK-PRODUCT] Error:', err.message);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/discounts/partner/:partnerViewUid
 * Endpoint untuk mendapatkan diskon dari partner tertentu
 * 
 * Query params:
 * - unique_id: (opsional) Unique ID user
 * - filter: (opsional) Filter diskon, default 2
 * 
 * Contoh:
 * GET /api/discounts/partner/617f701ba3b3a?unique_id=03421121304617f701ba3b374.23310242
 */
app.get('/api/discounts/partner/:partnerViewUid', async (req, res) => {
    try {
        const { partnerViewUid } = req.params;
        const { unique_id, filter = 2, include_expired = 'false' } = req.query;

        let discountsData = null;
        let usedUniqueId = unique_id || null; // ✅ fix: deklarasi di awal

        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎫 [DISCOUNTS/PARTNER] Request`);
        console.log(`   partner_view_uid : ${partnerViewUid}`);
        console.log(`   unique_id        : ${unique_id || '(tidak ada)'}`);
        console.log(`   filter           : ${filter}`);
        console.log(`   include_expired  : ${include_expired}`);
        console.log(`${'='.repeat(60)}`);

        // ── STEP 1: Fetch diskon ──
        if (unique_id) {
            console.log(`\n📡 [STEP 1] Fetch diskon via unique_id: ${unique_id}`);
            discountsData = await fetchDiscounts(unique_id, parseInt(filter));
        } else {
            console.log(`\n📡 [STEP 1] Fetch diskon via partner_view_uid: ${partnerViewUid}`);
            discountsData = await fetchDiscountsByPartner(partnerViewUid, parseInt(filter));
            if (discountsData?.unique_id) {
                usedUniqueId = discountsData.unique_id;
                console.log(`   ✅ unique_id ditemukan dari partner: ${usedUniqueId}`);
            }
        }

        console.log(`\n📦 [STEP 1 RESULT]`);
        console.log(`   discountsData ada : ${!!discountsData}`);
        console.log(`   total diskon      : ${discountsData?.discounts?.length ?? 0}`);

        if (!discountsData) {
            console.log(`   ⚠️ discountsData null — kemungkinan 401 atau unique_id salah`);
            return res.json({
                success: true,
                data: {
                    partner: { view_uid: partnerViewUid },
                    user_unique_id: usedUniqueId,
                    discounts: [],
                    total_discounts: 0,
                    debug: { reason: 'discountsData null' }
                }
            });
        }

        // ── STEP 2: Filter by partner_view_uid ──
        console.log(`\n🔍 [STEP 2] Filter by partner_view_uid: ${partnerViewUid}`);
        console.log(`   Semua partner_view_uid di diskon:`);
        discountsData.discounts?.forEach((d, i) => {
            const cocok = d.partner_view_uid === partnerViewUid ? '✅' : '  ';
            console.log(`   ${cocok} [${i}] ${d.partner_view_uid} | code: ${d.code}`);
        });

        const byPartner = (discountsData.discounts || []).filter(
            d => d.partner_view_uid === partnerViewUid
        );
        console.log(`\n   Cocok: ${byPartner.length} diskon`);

        // ── STEP 3: Filter expired ──
        console.log(`\n⏰ [STEP 3] Filter expired`);
        const now = new Date();
        console.log(`   Waktu sekarang: ${now.toISOString()}`);

        const aktif = [];
        const expired = [];

        byPartner.forEach(d => {
            const endDate = new Date(d.end_date);
            const isAktif = endDate > now;
            const status = isAktif ? '✅ AKTIF  ' : '❌ EXPIRED';
            console.log(`   ${status} | code: ${d.code} | end_date: ${d.end_date}`);
            if (isAktif) aktif.push(d);
            else expired.push(d);
        });

        console.log(`\n   Aktif  : ${aktif.length}`);
        console.log(`   Expired: ${expired.length}`);

        // include_expired=true untuk testing
        let partnerDiscounts = include_expired === 'true' ? byPartner : aktif;
        console.log(`   Dipakai: ${partnerDiscounts.length} (include_expired=${include_expired})`);

        // ── STEP 4: Fetch partner info ──
        console.log(`\n👤 [STEP 4] Fetch partner info: ${partnerViewUid}`);
        let partnerInfo = null;
        try {
            const partnerUrl = `https://app.jagel.id/api/users/${partnerViewUid}?driver=1`;
            const partnerRes = await axios.get(partnerUrl, { headers: jagelHeaders });
            if (partnerRes.data.success) {
                partnerInfo = partnerRes.data.data;
                console.log(`   ✅ Partner: ${partnerInfo.name} (${partnerInfo.username})`);
            } else {
                console.log(`   ⚠️ Partner API success=false`);
            }
        } catch (err) {
            console.log(`   ⚠️ Gagal fetch partner info: ${err.message}`);
        }

        // ── STEP 5: Build response ──
        const responseData = {
            partner: partnerInfo ? {
                view_uid: partnerInfo.view_uid,
                username: partnerInfo.username,
                name: partnerInfo.name,
                phone: partnerInfo.phone,
                partner_commission: partnerInfo.partner_commission || 0
            } : {
                view_uid: partnerViewUid
            },
            user_unique_id: usedUniqueId,
            discounts: partnerDiscounts,
            total_discounts: partnerDiscounts.length,
            discount_categories: {
                category_0: partnerDiscounts.filter(d => d.category === 0).length,
                category_1: partnerDiscounts.filter(d => d.category === 1).length,
                category_2: partnerDiscounts.filter(d => d.category === 2).length,
                category_3: partnerDiscounts.filter(d => d.category === 3).length
            },
            // ✅ debug info — bisa dihapus saat production
            _debug: {
                total_dari_api: discountsData.discounts?.length ?? 0,
                cocok_partner: byPartner.length,
                aktif: aktif.length,
                expired: expired.length,
                include_expired: include_expired === 'true',
                waktu_server: now.toISOString()
            }
        };

        console.log(`\n✅ [STEP 5] Response siap`);
        console.log(`   total_discounts : ${responseData.total_discounts}`);
        console.log(`${'='.repeat(60)}\n`);

        res.json({ success: true, data: responseData });

    } catch (err) {
        console.error(`\n❌ [DISCOUNTS/PARTNER] Error: ${err.message}`);
        console.error(err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────

// Tambah di server.js
app.get('/api/cache/clear', (req, res) => {
    const before = Object.keys(discountCache).length;
    Object.keys(discountCache).forEach(k => delete discountCache[k]);
    console.log(`🗑️ Cache cleared: ${before} entries`);
    res.json({ success: true, message: `Cache cleared: ${before} entries` });
});
app.listen(PORT, () => {
    console.log(`\n🚀 UFood Server berjalan di port ${PORT}`);
    console.log(`\n━━━ SSE ENDPOINTS (batch ${BATCH_SIZE} toko) ━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  📡 Stream Toko     : GET /api/stores-stream?source=uwarung|makanan&lat=&lng=`);
    console.log(`  📡 Stream Produk   : GET /api/products-stream?source=uwarung|makanan&lat=&lng=`);
    console.log(`  📡 Stream Menu     : GET /api/store/:viewUid/menu-stream?lat=&lng=`);
    console.log(`\n━━━ JSON ENDPOINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  🏪 Daftar Toko     : GET /api/stores?source=uwarung|makanan&lat=&lng=`);
    console.log(`  🛍️  Daftar Produk  : GET /api/products?source=uwarung|makanan&lat=&lng=`);
    console.log(`  🏪 Detail Toko     : GET /api/store/:viewUid`);
    console.log(`  🍽️  Produk Toko    : GET /api/store/:viewUid/products?lat=&lng=`);
    console.log(`  📄 Info Produk     : GET /api/product/:viewUid`);
    console.log(`  ⭐ Ulasan Produk   : GET /api/product/:viewUid/reviews`);
    console.log(`\n━━━ DISCOUNT / PROMO ENDPOINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  🎫 Daftar Diskon   : GET /api/discounts?unique_id=...&filter=...`);
    console.log(`  🎫 Diskon Partner  : GET /api/discounts/partner/:partnerViewUid?unique_id=...`);
    console.log(`  🎫 Cek Diskon Produk: GET /api/discounts/check-product/:productViewUid?unique_id=...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});