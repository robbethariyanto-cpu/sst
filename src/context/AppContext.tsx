import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Category, Product, CartItem, StoreSettings, TrendInfo } from '../types';

interface AppState {
  categories: Category[];
  products: Product[];
  cart: CartItem[];
  settings: StoreSettings;
  trends: TrendInfo[];
  isAdmin: boolean;
  hasAdmin: boolean;
}

interface AppContextType extends AppState {
  addToCart: (product: Product, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  loginAdmin: (password: string) => boolean;
  registerAdmin: (password: string) => void;
  logoutAdmin: () => void;
  changeAdminPassword: (oldPassword: string, newPassword: string) => boolean;
  
  fetchProducts: () => Promise<void>;
  fetchNextProducts: () => Promise<void>;
  hasMoreProducts: boolean;

  updateSettings: (settings: StoreSettings) => Promise<void>;

  
  addCategory: (category: Category) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (categories: Category[]) => Promise<void>;
  
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  reorderProducts: (products: Product[]) => Promise<void>;
  
  addTrend: (trend: TrendInfo) => Promise<void>;
  updateTrend: (trend: TrendInfo) => Promise<void>;
  deleteTrend: (id: string) => Promise<void>;
}

const defaultSettings: StoreSettings = {
  storeName: 'Solusi Rumahku',
  whatsappNumber: '6281234567890',
  aboutText: 'Solusi Rumahku adalah toko yang menyediakan berbagai macam peralatan listrik, kerja tehnik, dan perlengkapan rumah tangga terbaik untuk kebutuhan Anda.',
  contactText: 'Hubungi kami melalui WhatsApp untuk pemesanan atau pertanyaan lebih lanjut.',
  themeColor: '#135A62',
  homeTitle: 'Peralatan Listrik & Teknik Terbaik',
  homeSubtitle: 'Solusi lengkap untuk kebutuhan rumah tangga Anda.',
  homeTitleSize: 'md',
  layoutStyle: 'default',
  showCategories: true,
  showNewProducts: true,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultSettings);
  const [trends, setTrends] = useState<TrendInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(false);

  const [lastVisibleProduct, setLastVisibleProduct] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);

  const fetchProducts = useCallback(async () => {
    if (!db) return;
    try {
      const q = query(collection(db, 'products'), orderBy('id', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => doc.data() as Product);
      // Optional: Since order is originally done in client, it's better to fetch by id descending for latest
      // The sort logic the user had used `id` if order wasn't set.
      setProducts(data);
      if (snapshot.docs.length > 0) {
        setLastVisibleProduct(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreProducts(snapshot.docs.length === 20);
      } else {
        setHasMoreProducts(false);
      }
    } catch (error) {
      console.error('Failed to fetch products', error);
    }
  }, []);

  const fetchNextProducts = useCallback(async () => {
    if (!db || !lastVisibleProduct || !hasMoreProducts) return;
    try {
      const q = query(collection(db, 'products'), orderBy('id', 'desc'), startAfter(lastVisibleProduct), limit(20));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => doc.data() as Product);
      setProducts(prev => [...prev, ...data]);
      if (snapshot.docs.length > 0) {
        setLastVisibleProduct(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreProducts(snapshot.docs.length === 20);
      } else {
        setHasMoreProducts(false);
      }
    } catch (error) {
      console.error('Failed to fetch next products', error);
    }
  }, [lastVisibleProduct, hasMoreProducts]);

  // Initial Fetch
  useEffect(() => {
    if (!db) return;

    // Settings (keep onSnapshot for real-time updates for config, it's just 1 doc)
    const unsubSettings = onSnapshot(doc(db, 'settings', 'store'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as StoreSettings);
      }
    });

    const fetchInitialData = async () => {
      try {
        // Categories
        const categoriesSnap = await getDocs(query(collection(db, 'categories'), limit(100)));
        const catsData = categoriesSnap.docs.map(d => d.data() as Category);
        catsData.sort((a, b) => {
          if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order;
          if (typeof a.order === 'number') return 1;
          if (typeof b.order === 'number') return -1;
          return Number(b.id) - Number(a.id);
        });
        setCategories(catsData);

        // Trends
        const trendsSnap = await getDocs(query(collection(db, 'trends'), limit(50)));
        const trendsData = trendsSnap.docs.map(d => d.data() as TrendInfo);
        trendsData.sort((a, b) => Number(b.id) - Number(a.id));
        setTrends(trendsData);

        await fetchProducts();

      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    };

    fetchInitialData();

    return () => {
      unsubSettings();
    };
  }, [fetchProducts]);

  // Load from local storage for cart and admin
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('cart');
      if (savedCart && savedCart !== 'undefined') setCart(JSON.parse(savedCart));
    } catch (e) { console.error('Failed to load cart', e); }
    const savedAdminCredentials = localStorage.getItem('adminCredentials');
    if (savedAdminCredentials) setHasAdmin(true);
  }, []);

  // Save cart to local storage
  useEffect(() => {
    try { localStorage.setItem('cart', JSON.stringify(cart)); } catch(e){}
  }, [cart]);

  const addToCart = (product: Product, quantity: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setCart([]);

  const registerAdmin = (password: string) => {
    const encoded = btoa(password);
    localStorage.setItem('adminCredentials', encoded);
    setHasAdmin(true);
    setIsAdmin(true);
  };

  const loginAdmin = (password: string) => {
    const saved = localStorage.getItem('adminCredentials');
    if (saved && atob(saved) === password) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const logoutAdmin = () => setIsAdmin(false);

  const changeAdminPassword = (oldPassword: string, newPassword: string) => {
    const saved = localStorage.getItem('adminCredentials');
    if (saved && atob(saved) === oldPassword) {
      const encoded = btoa(newPassword);
      localStorage.setItem('adminCredentials', encoded);
      return true;
    }
    return false;
  };

  // --- Data Mutations with local state updates ---

  const updateSettings = async (newSettings: StoreSettings) => {
    if (!db) return;
    try { await setDoc(doc(db, 'settings', 'store'), newSettings); } catch(e) { console.warn(e); }
  };
  
  const addCategory = async (category: Category) => {
    if (!db) return;
    try { await setDoc(doc(db, 'categories', category.id), category); } catch(e) { console.warn(e); }
  };

  const updateCategory = async (category: Category) => {
    if (!db) return;
    try { await setDoc(doc(db, 'categories', category.id), category); } catch(e) { console.warn(e); }
  };

  const deleteCategory = async (id: string) => {
    if (!db) return;
    try { await deleteDoc(doc(db, 'categories', id)); } catch(e) { console.warn(e); }
  };

  const reorderCategories = async (newCategories: Category[]) => {
    if (!db) return;
    try {
      const batch = newCategories.map((c, index) => {
        const updated = { ...c, order: index };
        return setDoc(doc(db, 'categories', c.id), updated);
      });
      await Promise.all(batch);
    } catch(e) { console.warn(e); }
  };
  
  const addProduct = async (product: Product) => {
    if (!db) return;
    try { await setDoc(doc(db, 'products', product.id), product); } catch(e) { console.warn(e); }
  };

  const updateProduct = async (product: Product) => {
    if (!db) return;
    try { await setDoc(doc(db, 'products', product.id), product); } catch(e) { console.warn(e); }
  };

  const deleteProduct = async (id: string) => {
    if (!db) return;
    try { await deleteDoc(doc(db, 'products', id)); } catch(e) { console.warn(e); }
  };

  const reorderProducts = async (newProducts: Product[]) => {
    if (!db) return;
    try {
      const batch = newProducts.map((p, index) => {
        const updated = { ...p, order: index };
        return setDoc(doc(db, 'products', p.id), updated);
      });
      await Promise.all(batch);
    } catch(e) { console.warn(e); }
  };
  
  const addTrend = async (trend: TrendInfo) => {
    if (!db) return;
    try { await setDoc(doc(db, 'trends', trend.id), trend); } catch(e) { console.warn(e); }
  };

  const updateTrend = async (trend: TrendInfo) => {
    if (!db) return;
    try { await setDoc(doc(db, 'trends', trend.id), trend); } catch(e) { console.warn(e); }
  };

  const deleteTrend = async (id: string) => {
    if (!db) return;
    try { await deleteDoc(doc(db, 'trends', id)); } catch(e) { console.warn(e); }
  };

  return (
    <AppContext.Provider value={{
      categories, products, cart, settings, trends, isAdmin, hasAdmin,
      addToCart, removeFromCart, updateCartQuantity, clearCart,
      loginAdmin, registerAdmin, logoutAdmin, changeAdminPassword, updateSettings,
      fetchProducts, fetchNextProducts, hasMoreProducts,
      addCategory, updateCategory, deleteCategory, reorderCategories,
      addProduct, updateProduct, deleteProduct, reorderProducts,
      addTrend, updateTrend, deleteTrend
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
