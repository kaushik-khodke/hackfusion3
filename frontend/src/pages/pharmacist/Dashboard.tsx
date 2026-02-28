import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loader2, Package, AlertTriangle, CheckCircle, Clock, Edit2, Check, X, Search, Activity, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Legend, ReferenceLine, ComposedChart, Line
} from 'recharts';
import { PharmacistAI } from "./PharmacistAI";

export default function PharmacistDashboard() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);

    // Data State
    const [orders, setOrders] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [allMedicines, setAllMedicines] = useState<any[]>([]);
    const [orderHistory, setOrderHistory] = useState<any[]>([]);
    const [refillAlerts, setRefillAlerts] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);

    const [editingMedId, setEditingMedId] = useState<string | null>(null);
    const [editMedStock, setEditMedStock] = useState<number>(0);

    const [orderSearchQuery, setOrderSearchQuery] = useState("");
    const [medSearchQuery, setMedSearchQuery] = useState("");

    // AI Panel State
    const [isAIOpen, setIsAIOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        fetchDashboardData();

        // 🟢 Setup Realtime Subscriptions
        const channels = supabase
            .channel('pharmacist-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchDashboardData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'medicines' }, fetchDashboardData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_history_raw' }, fetchDashboardData)
            .subscribe();

        return () => {
            supabase.removeChannel(channels);
        };
    }, [user]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Orders (pending mostly)
            const { data: oData } = await supabase
                .from("orders")
                .select(`
          id, status, created_at, 
          patients(full_name), 
          order_items(qty, medicines(name))
        `)
                .order("created_at", { ascending: false })
                .limit(50);
            setOrders(oData || []);

            // 2. Fetch Low Inventory
            const { data: iData } = await supabase
                .from("medicines")
                .select("*")
                .order("stock", { ascending: true })
                .limit(50);
            setInventory(iData || []);

            // 3. Fetch Refill Alerts
            const { data: rData } = await supabase
                .from("refill_alerts")
                .select(`
          id, predicted_runout_date, status,
          patients(full_name),
          medicines(name)
        `)
                .eq("status", "pending")
                .order("predicted_runout_date", { ascending: true });
            setRefillAlerts(rData || []);

            // 4. Fetch low stock notifications
            const { data: nData } = await supabase
                .from("notification_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(10);
            setNotifications(nData || []);

            // 5. Fetch all medicines for "Medicines Record"
            const { data: mData } = await supabase
                .from("medicines")
                .select("*")
                .order("name", { ascending: true });
            setAllMedicines(mData || []);

            // 6. Fetch raw order history
            const { data: ohData } = await supabase
                .from("order_history_raw")
                .select("*")
                .order("purchase_date", { ascending: false })
                .limit(100);
            setOrderHistory(ohData || []);

        } catch (err) {
            console.error("Dashboard error", err);
        } finally {
            setLoading(false);
        }
    };

    const updateOrderStatus = async (orderId: string, status: string) => {
        try {
            // If approved, trigger stock deduction via the backend or client side (we use client approach here)
            if (status === "approved" || status === "fulfilled") {
                // Fetch order items to decrement
                const { data: items } = await supabase
                    .from("order_items")
                    .select("medicine_id, qty")
                    .eq("order_id", orderId);

                if (items) {
                    for (const item of items) {
                        // Avoid RPC to ensure it runs without backend functions
                        const { data: med } = await supabase
                            .from("medicines")
                            .select("stock")
                            .eq("id", item.medicine_id)
                            .single();

                        if (med) {
                            await supabase
                                .from("medicines")
                                .update({ stock: med.stock - item.qty })
                                .eq("id", item.medicine_id);
                        }
                    }
                }
            }

            const { error } = await supabase
                .from("orders")
                .update({ status })
                .eq("id", orderId);

            if (!error) {
                setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEditStockClick = (med: any) => {
        setEditingMedId(med.id);
        setEditMedStock(med.stock);
    };

    const saveMedicineStock = async (medId: string, directStockValue?: number) => {
        const stockToSave = directStockValue !== undefined ? directStockValue : editMedStock;
        try {
            const { error } = await supabase
                .from("medicines")
                .update({ stock: stockToSave })
                .eq("id", medId);

            if (!error) {
                // local update (realtime will also catch it, but this makes it instantly snappy)
                setAllMedicines(allMedicines.map(m => m.id === medId ? { ...m, stock: stockToSave } : m));
                setEditingMedId(null);
            } else {
                console.error("Failed to update stock:", error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Calculate Trend Data (last 14 days of order & revenue)
    const trendData = useMemo(() => {
        if (!orderHistory.length) return [];
        const grouped = orderHistory.reduce((acc: any, oh: any) => {
            const date = new Date(oh.purchase_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (!acc[date]) acc[date] = { orders: 0, revenue: 0 };
            acc[date].orders += 1;
            acc[date].revenue += Number(oh.total_price_eur) || 0;
            return acc;
        }, {});

        return Object.keys(grouped).slice(0, 14).map(date => ({
            date,
            orders: grouped[date].orders,
            revenue: Math.round(grouped[date].revenue * 10) / 10
        })).reverse();
    }, [orderHistory]);

    // Calculate Critical Stock Data (items near or below threshold)
    const stockChartData = useMemo(() => {
        return allMedicines
            .filter(m => m.stock <= (m.reorder_threshold ?? 10) * 1.5)
            .sort((a, b) => a.stock - b.stock)
            .slice(0, 8)
            .map(m => ({
                name: m.name.substring(0, 12) + (m.name.length > 12 ? '...' : ''),
                stock: m.stock,
                threshold: m.reorder_threshold ?? 10
            }));
    }, [allMedicines]);

    if (loading) {
        return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
    }

    const pendingOrders = orders.filter(o => o.status === "pending");
    const lowStockMeds = inventory.filter(m => m.stock <= (m.reorder_threshold || 10));

    // Filter Logic
    const filteredOrderHistory = orderHistory.filter(oh =>
        (oh.patient_external_id || "").toLowerCase().includes((orderSearchQuery || "").toLowerCase()) ||
        (oh.product_name || "").toLowerCase().includes((orderSearchQuery || "").toLowerCase())
    );

    const filteredMedicines = allMedicines.filter(m =>
        (m.name || "").toLowerCase().includes((medSearchQuery || "").toLowerCase()) ||
        (m.strength || "").toLowerCase().includes((medSearchQuery || "").toLowerCase())
    );

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring", stiffness: 300, damping: 24 }
        }
    };

    return (
        <motion.div
            className="container mx-auto px-4 py-8 space-y-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold font-heading">Pharmacist Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Manage orders, inventory, and predictive refills.</p>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div variants={itemVariants}>
                    <Card className="bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800 h-full">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-100 dark:bg-red-800 rounded-xl">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Critical Stock</p>
                                    <p className="text-2xl font-bold text-red-600">{lowStockMeds.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Card className="bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-amber-100 dark:bg-amber-800 rounded-xl">
                                    <Package className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Refill Alerts</p>
                                    <p className="text-2xl font-bold text-amber-600">{lowStockMeds.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Charts & Recent Orders Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                {/* Order Trend Chart (Takes 2 cols) */}
                <motion.div variants={itemVariants} className="lg:col-span-2">
                    <Card className="h-full border-indigo-100 dark:border-indigo-900 shadow-lg shadow-indigo-100/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-indigo-500" />
                                    14-Day Revenue & Orders
                                </div>
                                <div className="text-sm font-normal text-muted-foreground">
                                    Total Orders: {orders.length} | Pending: {pendingOrders.length}
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(val) => `€${val}`} />
                                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                        <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
                                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue (€)" stroke="#10b981" fill="url(#colorRevenue)" strokeWidth={2} />
                                        <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Recent Orders (Takes 1 col) */}
                <motion.div variants={itemVariants} className="lg:col-span-1">
                    <Card className="h-[400px] border-blue-100 dark:border-blue-900 shadow-lg shadow-blue-100/20 flex flex-col">
                        <CardHeader className="pb-2 bg-blue-50/50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
                            <CardTitle className="text-lg flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500" /> Recent Orders</div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-0">
                            <div className="divide-y divide-border">
                                {orders.slice(0, 6).map(o => (
                                    <div key={o.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-semibold text-sm">{o.patients?.full_name}</h4>
                                            <Badge variant={o.status === 'pending' ? 'default' : 'outline'} className={o.status === 'pending' ? 'bg-amber-500 hover:bg-amber-600 border-none text-white' : 'text-xs capitalize'}>
                                                {o.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {o.order_items?.map((item: any) => `${item.qty}x ${item.medicines?.name}`).join(", ")}
                                        </p>
                                        {o.status === "pending" && (
                                            <div className="flex items-center gap-2 mt-2">
                                                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 w-full" onClick={() => updateOrderStatus(o.id, "approved")}>Approve</Button>
                                                <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 w-full" onClick={() => updateOrderStatus(o.id, "rejected")}>Reject</Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {orders.length === 0 && <p className="text-center text-muted-foreground p-8 text-sm">No orders found.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Critical Stock & Refill Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Refill Alerts */}
                <motion.div variants={itemVariants}>
                    <Card className="h-full border-amber-100 dark:border-amber-900 shadow-xl shadow-amber-100/20">
                        <CardHeader className="bg-amber-50/50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
                            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                                <Package className="w-5 h-5" /> Refill Action Required
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                                {lowStockMeds.length > 0 ? lowStockMeds.map(med => (
                                    <div
                                        key={med.id}
                                        className="p-4 flex justify-between items-center hover:bg-amber-50/30 transition-colors cursor-pointer group"
                                        onClick={() => {
                                            const amount = window.prompt(`Amount to refill for ${med.name}?`);
                                            if (amount && !isNaN(Number(amount))) {
                                                const numericAmount = Number(amount);
                                                if (numericAmount > 0) {
                                                    const newStock = med.stock + numericAmount;
                                                    setEditingMedId(med.id);
                                                    setEditMedStock(newStock);
                                                    saveMedicineStock(med.id, newStock);
                                                }
                                            }
                                        }}
                                    >
                                        <div>
                                            <h4 className="font-medium text-sm text-foreground group-hover:text-amber-700 transition-colors flex items-center gap-2">
                                                {med.name}
                                                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </h4>
                                            <p className="text-xs text-muted-foreground mt-1">Current Stock: {med.stock}</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 font-medium whitespace-nowrap">
                                                Tap to Refill
                                            </Badge>
                                        </div>
                                    </div>
                                )) : <p className="text-center text-muted-foreground p-8 text-sm">No pending refill alerts.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Critical Stock Tracker */}
                <motion.div variants={itemVariants}>
                    <Card className="h-full border-red-100 dark:border-red-900 shadow-xl shadow-red-100/20">
                        <CardHeader className="bg-red-50/50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
                            <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-300">
                                <AlertTriangle className="w-5 h-5" /> Critical Stock Tracker
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                                {lowStockMeds.length > 0 ? lowStockMeds.map(m => (
                                    <div key={m.id} className="p-4 flex justify-between items-center hover:bg-red-50/30 transition-colors">
                                        <div>
                                            <h4 className="font-semibold text-sm">{m.name} <span className="text-xs font-normal text-muted-foreground ml-1">{m.strength}</span></h4>
                                            <p className="text-xs text-muted-foreground mt-1">Threshold: {m.reorder_threshold || 10}</p>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <Badge variant="destructive" className="animate-pulse shadow-sm">
                                                {m.stock} in stock
                                            </Badge>
                                        </div>
                                    </div>
                                )) : <p className="text-center text-muted-foreground p-8 text-sm">Inventory levels are healthy.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* System Notifications */}
            {notifications.length > 0 && (
                <motion.div variants={itemVariants}>
                    <Card>
                        <CardHeader>
                            <CardTitle>System Notifications Log</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {notifications.map(n => {
                                    const isAlert = n.type === 'low_stock' || n.type === 'refill_alert';
                                    const isOrder = n.type === 'order_confirmation';

                                    return (
                                        <div key={n.id} className="p-3 text-sm bg-muted/40 rounded flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                            <div className="flex items-start sm:items-center gap-3">
                                                {isAlert ? (
                                                    <Badge variant="outline" className="border-amber-300 text-amber-600 shrink-0 whitespace-nowrap">
                                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                                        {n.type === 'low_stock' ? 'Inventory Alert' : 'Refill Alert'}
                                                    </Badge>
                                                ) : isOrder ? (
                                                    <Badge variant="outline" className="border-green-300 text-green-600 shrink-0 whitespace-nowrap">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Order Confirmed
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="border-blue-300 text-blue-600 shrink-0 whitespace-nowrap">
                                                        System Event
                                                    </Badge>
                                                )}

                                                <span className="text-foreground">
                                                    {n.type === 'low_stock' && (
                                                        <>{n.payload?.medicine_name} is critically low (Stock: <span className="font-bold text-red-500">{n.payload?.current_stock}</span>).</>
                                                    )}
                                                    {n.type === 'refill_alert' && (
                                                        <>{n.payload?.patient_name} needs a refill of {n.payload?.medicine_name} soon.</>
                                                    )}
                                                    {n.type === 'order_confirmation' && (
                                                        <>Order placed for {n.payload?.medicine_name} (Qty: {n.payload?.qty}).</>
                                                    )}
                                                    {!['low_stock', 'refill_alert', 'order_confirmation'].includes(n.type) && (
                                                        <>Event logged type: {n.type}</>
                                                    )}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0">{new Date(n.created_at).toLocaleString()}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Raw Order History Table */}
            <motion.div variants={itemVariants}>
                <Card>
                    <CardHeader>
                        <CardTitle>Global Order History (Raw Records)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground bg-muted/40 uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Patient Ext ID</th>
                                        <th className="px-4 py-3">Product</th>
                                        <th className="px-4 py-3">Qty</th>
                                        <th className="px-4 py-3">Price (€)</th>
                                        <th className="px-4 py-3">Demographics</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrderHistory.map((oh: any) => (
                                        <tr key={oh.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">{new Date(oh.purchase_date).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{oh.patient_external_id}</td>
                                            <td className="px-4 py-3 font-medium">{oh.product_name}</td>
                                            <td className="px-4 py-3">{oh.quantity}</td>
                                            <td className="px-4 py-3">€{oh.total_price_eur}</td>
                                            <td className="px-4 py-3">Age: {oh.patient_age}, {oh.patient_gender}</td>
                                        </tr>
                                    ))}
                                    {filteredOrderHistory.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground bg-muted/5">No historical records found matching "{orderSearchQuery}".</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Full Medicines Database */}
            <motion.div variants={itemVariants}>
                <Card>
                    <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0 pb-4 border-b bg-gradient-to-r from-muted/30 to-transparent">
                        <CardTitle>Comprehensive Medicines Record</CardTitle>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by name or strength..."
                                value={medSearchQuery}
                                onChange={(e) => setMedSearchQuery(e.target.value)}
                                className="pl-9 p-2 w-full text-sm border rounded-md bg-background"
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="w-full border rounded-md overflow-hidden">
                            <div className="max-h-[450px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted-foreground bg-muted/60 uppercase sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3">Medicine Name</th>
                                            <th className="px-4 py-3">Strength</th>
                                            <th className="px-4 py-3">Unit/Size</th>
                                            <th className="px-4 py-3 text-center">In Stock</th>
                                            <th className="px-4 py-3 text-center">Req. Prescription</th>
                                            <th className="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMedicines.map((med: any) => (
                                            <tr key={med.id} className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${med.stock <= (med.reorder_threshold ?? 10) ? 'bg-red-500/5 hover:bg-red-500/10' : ''}`}>
                                                <td className="px-4 py-3 font-medium text-primary">{med.name}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{med.strength || '-'}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{med.package_size || med.unit_type || '-'}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {editingMedId === med.id ? (
                                                        <input
                                                            type="number"
                                                            value={editMedStock}
                                                            onChange={(e) => setEditMedStock(Number(e.target.value))}
                                                            className="w-20 p-1 text-sm border rounded bg-background text-center"
                                                        />
                                                    ) : (
                                                        <Badge variant={med.stock <= (med.reorder_threshold ?? 10) ? 'destructive' : 'outline'}>
                                                            {med.stock}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {med.prescription_required ? <CheckCircle className="w-4 h-4 text-amber-500 mx-auto" /> : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {editingMedId === med.id ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => saveMedicineStock(med.id)} className="p-1 rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors">
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => setEditingMedId(null)} className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => handleEditStockClick(med)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
                                                            <Edit2 className="w-4 h-4 mx-auto" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredMedicines.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground bg-muted/5">No medicines found matching "{medSearchQuery}".</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Floating Action Button for AI */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.5 }}
                className="fixed bottom-6 right-6 z-40"
            >
                {!isAIOpen && (
                    <Button
                        onClick={() => setIsAIOpen(true)}
                        className="h-14 w-14 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-xl hover:shadow-2xl hover:scale-105 transition-all p-0 flex items-center justify-center border-2 border-white/20"
                    >
                        <Search className="w-6 h-6 text-white" />
                    </Button>
                )}
            </motion.div>

            {/* AI Assistant Panel */}
            <PharmacistAI isOpen={isAIOpen} onToggle={() => setIsAIOpen(!isAIOpen)} />

        </motion.div >
    );
}
