import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loader2, Package, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

export default function PharmacistDashboard() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);

    // Data State
    const [orders, setOrders] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [refillAlerts, setRefillAlerts] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        if (!user) return;
        fetchDashboardData();
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

    if (loading) {
        return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
    }

    const pendingOrders = orders.filter(o => o.status === "pending");
    const lowStockMeds = inventory.filter(m => m.stock <= (m.reorder_threshold || 10));

    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold font-heading">Pharmacist Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Manage orders, inventory, and predictive refills.</p>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Orders Table */}
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

                {/* Inventory Monitor */}
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

                {/* System Notifications */}
                <Card className="col-span-1 lg:col-span-2">
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
            </div>
        </div>
    );
}
