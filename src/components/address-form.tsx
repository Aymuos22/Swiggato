"use client";

import { useActionState, useEffect, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";

import {
  createAddressAction,
  reverseGeocodeAction,
  type AddressFormState
} from "@/lib/actions/addresses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: AddressFormState = {};

type Coords = {
  latitude: string;
  longitude: string;
};

export function AddressForm() {
  const [state, action] = useActionState(createAddressAction, initialState);
  const [coords, setCoords] = useState<Coords>({ latitude: "", longitude: "" });
  const [addressText, setAddressText] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const detectLocation = (fillAddress: boolean) => {
    setLocationError(null);
    setLocationStatus("Detecting your location…");
    setIsLocating(true);

    if (!navigator.geolocation) {
      setIsLocating(false);
      setLocationStatus(null);
      setLocationError("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setCoords({
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7)
        });
        setLocationStatus("Location detected.");
        setIsLocating(false);

        if (fillAddress) {
          void reverseGeocodeAction(latitude, longitude).then((resolved) => {
            if (resolved) {
              setAddressText((current) => current.trim() || resolved);
              setLocationStatus("Location and address detected.");
            }
          });
        }
      },
      (error) => {
        setIsLocating(false);
        setLocationStatus(null);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError("Location permission denied. Allow location access and try again.");
          return;
        }
        if (error.code === error.TIMEOUT) {
          setLocationError("Location request timed out. Try again.");
          return;
        }
        setLocationError("Could not detect location. Enter coordinates manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60_000
      }
    );
  };

  useEffect(() => {
    detectLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form action={action} data-loader-label="Saving address…" className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" placeholder="Home" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          required
          value={addressText}
          onChange={(event) => setAddressText(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Coordinates</Label>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => detectLocation(false)}
            disabled={isLocating}
          >
            <LocateFixed className="h-4 w-4" />
            {isLocating ? "Detecting…" : "Use my location"}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              name="latitude"
              inputMode="decimal"
              required
              value={coords.latitude}
              onChange={(event) => setCoords((current) => ({ ...current, latitude: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              name="longitude"
              inputMode="decimal"
              required
              value={coords.longitude}
              onChange={(event) => setCoords((current) => ({ ...current, longitude: event.target.value }))}
            />
          </div>
        </div>
        {locationStatus ? <p className="text-xs text-muted-foreground">{locationStatus}</p> : null}
        {locationError ? <p className="text-xs text-destructive">{locationError}</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
        <Textarea id="deliveryInstructions" name="deliveryInstructions" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="isDefault" value="true" type="checkbox" className="h-4 w-4" />
        Make default
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-[hsl(175_55%_22%)]">Address saved.</p> : null}
      <Button type="submit" className="w-full">
        <MapPin className="h-4 w-4" />
        Save Address
      </Button>
    </form>
  );
}
