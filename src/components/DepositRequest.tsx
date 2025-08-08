import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Bitcoin, Coins, Euro, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function DepositRequest() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedCrypto, setSelectedCrypto] = useState<"bitcoin" | "litecoin">("bitcoin");
  const [eurAmount, setEurAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [depositRequest, setDepositRequest] = useState<{
    amount_btc: number;
    amount_eur: number;
    qr_data: string;
    fingerprint: number;
  } | null>(null);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [ltcPrice, setLtcPrice] = useState<number | null>(null);

  const addresses = {
    bitcoin: "bc1qdqmcl0rc5u62653y68wqxcadtespq68kzt4z2z",
    litecoin: "LiFeR5xaRCWPPpNsvb1XHLPytyQHAHKRex"
  };

  const fetchPrices = async () => {
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

  const createDepositRequest = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to create a deposit request",
        variant: "destructive",
      });
      return;
    }

    if (!eurAmount || parseFloat(eurAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      await fetchPrices();
      
      const amountEur = parseFloat(eurAmount);
      const price = selectedCrypto === "bitcoin" ? btcPrice : ltcPrice;
      
      if (!price) {
        throw new Error("Could not fetch crypto price");
      }
      
      const amountCrypto = amountEur / price;
      
      // Generate fingerprint (1-99 satoshis/litoshis)
      const fingerprint = Math.floor(Math.random() * 99) + 1;
      const finalAmount = amountCrypto + (fingerprint / 1e8);
      
      // Create deposit request in database
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: 'deposit_request',
          amount_eur: amountEur,
          amount_btc: finalAmount, // Store crypto amount here
          status: 'pending',
          description: `deposit_request:${selectedCrypto === "bitcoin" ? "btc" : "ltc"}`
        })
        .select()
        .single();

      if (error) throw error;

      // Create BIP21 URI with exact amount
      const address = addresses[selectedCrypto];
      const currency = selectedCrypto === "bitcoin" ? "bitcoin" : "litecoin";
      const qrData = `${currency}:${address}?amount=${finalAmount.toFixed(8)}`;
      
      setDepositRequest({
        amount_btc: finalAmount,
        amount_eur: amountEur,
        qr_data: qrData,
        fingerprint
      });

      toast({
        title: "Deposit Request Created",
        description: `Send exactly ${finalAmount.toFixed(8)} ${selectedCrypto.toUpperCase()} to the address`,
      });
      
    } catch (error) {
      console.error('Error creating deposit request:', error);
      
      let errorMessage = "Could not create deposit request";
      
      if (error instanceof Error) {
        if (error.message.includes('auth')) {
          errorMessage = "Please log in to create a deposit request";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyQRData = async () => {
    if (!depositRequest) return;
    
    await navigator.clipboard.writeText(depositRequest.qr_data);
    toast({
      title: "Copied",
      description: "Payment URI copied to clipboard",
    });
  };

  const copyAddress = async () => {
    const address = addresses[selectedCrypto];
    await navigator.clipboard.writeText(address);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const resetRequest = () => {
    setDepositRequest(null);
    setEurAmount("");
  };

  if (depositRequest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {selectedCrypto === "bitcoin" ? (
              <Bitcoin className="h-5 w-5 text-orange-500" />
            ) : (
              <Coins className="h-5 w-5 text-blue-500" />
            )}
            Deposit Request Created
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>Amount (EUR):</span>
              <span className="font-bold">€{depositRequest.amount_eur.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount ({selectedCrypto.toUpperCase()}):</span>
              <span className="font-bold">{depositRequest.amount_btc.toFixed(8)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Fingerprint:</span>
              <span>+{depositRequest.fingerprint} {selectedCrypto === "bitcoin" ? "sats" : "litoshis"}</span>
            </div>
          </div>

          <div className="text-center">
            <QRCodeSVG 
              value={depositRequest.qr_data}
              size={200}
              className="mx-auto border rounded-lg p-2"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">BIP21 Payment URI:</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                  {depositRequest.qr_data}
                </code>
                <Button variant="outline" size="sm" onClick={copyQRData}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {selectedCrypto === "bitcoin" ? "Bitcoin" : "Litecoin"} Address:
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm break-all">
                  {addresses[selectedCrypto]}
                </code>
                <Button variant="outline" size="sm" onClick={copyAddress}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">Important:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
              <li>Send EXACTLY {depositRequest.amount_btc.toFixed(8)} {selectedCrypto.toUpperCase()}</li>
              <li>Do not round the amount - use the full 8 decimal places</li>
              <li>Payment will be credited after 1 confirmation</li>
              <li>Request expires after 45 minutes</li>
            </ul>
          </div>

          <Button onClick={resetRequest} variant="outline" className="w-full">
            Create New Request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5 text-primary" />
          Create Deposit Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (EUR)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="1"
              placeholder="Enter amount in EUR"
              value={eurAmount}
              onChange={(e) => setEurAmount(e.target.value)}
              disabled={!user}
            />
            {!user && (
              <p className="text-sm text-muted-foreground">
                Please log in to create deposit requests
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-medium">Select Cryptocurrency:</Label>
            <RadioGroup 
              value={selectedCrypto} 
              onValueChange={(value) => setSelectedCrypto(value as "bitcoin" | "litecoin")}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bitcoin" id="bitcoin" />
                <Label htmlFor="bitcoin" className="flex items-center gap-2 cursor-pointer">
                  <Bitcoin className="h-4 w-4 text-orange-500" />
                  Bitcoin (BTC)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="litecoin" id="litecoin" />
                <Label htmlFor="litecoin" className="flex items-center gap-2 cursor-pointer">
                  <Coins className="h-4 w-4 text-blue-500" />
                  Litecoin (LTC)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Button 
            onClick={createDepositRequest} 
            disabled={loading || !user || !eurAmount || parseFloat(eurAmount) <= 0}
            className="w-full"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating Request...
              </>
            ) : (
              'Create Deposit Request'
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>How it works:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Enter the EUR amount you want to deposit</li>
            <li>Choose Bitcoin or Litecoin</li>
            <li>You'll get a unique amount with a fingerprint</li>
            <li>Send the exact amount to get it credited automatically</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}