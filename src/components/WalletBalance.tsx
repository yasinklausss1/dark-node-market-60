import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, RefreshCw, Bitcoin, Euro, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WalletBalance {
  balance_eur: number;
  balance_btc: number;
  balance_ltc: number;
}

export function WalletBalance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [ltcPrice, setLtcPrice] = useState<number | null>(null);

  const fetchBalance = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('wallet_balances')
        .select('balance_eur, balance_btc, balance_ltc')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setBalance(data || { balance_eur: 0, balance_btc: 0, balance_ltc: 0 });
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      toast({
        title: "Error",
        description: "Balance could not be loaded",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCryptoPrices = async () => {
    try {
      const [btcResponse, ltcResponse] = await Promise.all([
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur'),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=eur')
      ]);
      
      const btcData = await btcResponse.json();
      const ltcData = await ltcResponse.json();
      
      setBtcPrice(btcData.bitcoin.eur);
      setLtcPrice(ltcData.litecoin.eur);
    } catch (error) {
      console.error('Error fetching crypto prices:', error);
    }
  };

  const refreshPayments = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke('check-bitcoin-payments');
      
      if (error) {
        throw error;
      }

      await fetchBalance();
      toast({
        title: "Updated",
        description: "Payments have been checked",
      });
    } catch (error) {
      console.error('Error refreshing payments:', error);
      toast({
        title: "Error",
        description: "Payments could not be updated",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchCryptoPrices();
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Balance
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshPayments}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Euro className="h-5 w-5 text-primary" />
              <span className="font-medium">EUR</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                €{balance?.balance_eur?.toFixed(2) || '0.00'}
              </div>
              {btcPrice && balance && (
                <div className="text-sm text-orange-500 flex items-center justify-end">
                  <Bitcoin className="h-3 w-3 mr-1" />
                  ₿{(balance.balance_eur / btcPrice).toFixed(8)}
                </div>
              )}
              {ltcPrice && balance && (
                <div className="text-sm text-blue-500 flex items-center justify-end">
                  <Coins className="h-3 w-3 mr-1" />
                  Ł{(balance.balance_eur / ltcPrice).toFixed(8)}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}