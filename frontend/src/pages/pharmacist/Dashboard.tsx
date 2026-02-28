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
    BarChart, Bar, Legend, ReferenceLine
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
                .eq("type", "low_stock")
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
                        await supabase.rpc("decrement_medicine_stock", {
                            med_id: item.medicine_id,
                            amount: item.qty
                        });
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

    const saveMedicineStock = async (medId: string) => {
        try {
            const { error } = await supabase
                .from("medicines")
                .update({ stock: editMedStock })
                .eq("id", medId);

            if (!error) {
                // local update (realtime will also catch it, but this makes it instantly snappy)
                setAllMedicines(allMedicines.map(m => m.id === medId ? { ...m, stock: editMedStock } : m));
                setEditingMedId(null);
            } else {
                console.error("Failed to update stock:", error);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Calculate Trend Data (last 14 days of order frequency)
    const trendData = useMemo(() => {
        if (!orderHistory.length) return [];
        const grouped = orderHistory.reduce((acc: any, oh: any) => {
            const date = new Date(oh.purchase_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});

        return Object.keys(grouped).slice(0, 14).map(date => ({
            date,
            orders: grouped[date]
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <motion.div variants={itemVariants}>
                    <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-blue-100 dark:bg-blue-800 rounded-xl">
                                    <Clock className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Pending Orders</p>
                                    <p className="text-2xl font-bold">{pendingOrders.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Card className="bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
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
                                    <p className="text-2xl font-bold text-amber-600">{refillAlerts.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Predictive Analytics & Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Order Trend Area Chart */}
                <motion.div variants={itemVariants}>
                    <Card className="h-full border-indigo-100 dark:border-indigo-900 shadow-lg shadow-indigo-100/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Activity className="w-5 h-5 text-indigo-500" />
                                14-Day Order Velocity
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[250px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                        <RechartsTooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                                            cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        />
                                        <Area type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Critical Stock Bar Chart */}
                <motion.div variants={itemVariants}>
                    <Card className="h-full border-red-100 dark:border-red-900 shadow-lg shadow-red-100/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-red-500" />
                                Critical Inventory Levels
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[250px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.2} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                        <RechartsTooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                                            cursor={{ fill: '#fef2f2' }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        <Bar dataKey="stock" name="Current Stock" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="threshold" name="Min Threshold" fill="#f87171" fillOpacity={0.4} radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Orders Table */}
                <motion.div variants={itemVariants}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Orders</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {orders.slice(0, 10).map(o => (
                                    <div key={o.id} className="p-4 rounded-xl border flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                                        <div>
                                            <h4 className="font-semibold">{o.patients?.full_name}</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {o.order_items?.map((item: any) => `${item.qty}x ${item.medicines?.name}`).join(", ")}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="mr-2">
                                                {o.status}
                                            </Badge>
                                            {o.status === "pending" && (
                                                <>
                                                    <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateOrderStatus(o.id, "approved")}>Approve</Button>
                                                    <Button size="sm" variant="outline" className="border-red-500 text-red-500" onClick={() => updateOrderStatus(o.id, "rejected")}>Reject</Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {orders.length === 0 && <p className="text-center text-muted-foreground">No orders found.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Inventory Monitor */}
                <motion.div variants={itemVariants}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Inventory Monitor</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {inventory.slice(0, 10).map(m => {
                                    const isLow = m.stock <= (m.reorder_threshold || 10);
                                    return (
                                        <div key={m.id} className={`p-4 rounded-xl border flex justify-between items-center ${isLow ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/50' : ''}`}>
                                            <div>
                                                <h4 className="font-semibold">{m.name} <span className="text-sm font-normal text-muted-foreground ml-2">{m.strength}</span></h4>
                                                <p className="text-sm text-muted-foreground">Threshold: {m.reorder_threshold || 10}</p>
                                            </div>
                                            <div>
                                                <Badge variant="default" className={isLow ? "bg-red-500 text-white" : "bg-green-500 text-white"}>
                                                    {m.stock} in stock
                                                </Badge>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* System Notifications */}
                <motion.div variants={itemVariants} className="col-span-1 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Notifications Log</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {notifications.map(n => (
                                    <div key={n.id} className="p-3 text-sm bg-muted/40 rounded flex justify-between items-center">
                                        <div>
                                            <Badge variant="outline" className="mr-2 border-red-300 text-red-600">Low Stock Alert</Badge>
                                            <span>{n.payload?.medicine_name} is critically low (Stock: {n.payload?.current_stock})</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                                    </div>
                                ))}
                                {notifications.length === 0 && <p className="text-sm text-muted-foreground">No recent alerts.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Raw Order History Table */}
                <motion.div variants={itemVariants} className="col-span-1 lg:col-span-2">
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
                <motion.div variants={itemVariants} className="col-span-1 lg:col-span-2">
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

            </div >

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
