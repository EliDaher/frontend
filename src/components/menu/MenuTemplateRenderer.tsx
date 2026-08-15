"use client";

import { useEffect } from "react";
import type { Category, MenuItem, Restaurant } from "@/types/menu";
import { CafeMenuTemplate } from "./templates/CafeMenuTemplate";
import { ClassicMenuTemplate } from "./templates/ClassicMenuTemplate";
import { MinimalMenuTemplate } from "./templates/MinimalMenuTemplate";
import { PinzaMenuTemplate } from "./templates/PinzaMenuTemplate";
import { PremiumMenuTemplate } from "./templates/PremiumMenuTemplate";

type Props = {
  restaurant: Restaurant;
  categories: Category[];
  items: MenuItem[];
};

export function MenuTemplateRenderer(props: Props) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log(`Current template: ${props.restaurant.template}`);
    }
  }, [props.restaurant.template]);

  switch (props.restaurant.template) {
    case "premium":
      return <PremiumMenuTemplate {...props} />;
    case "cafe":
      return <CafeMenuTemplate {...props} />;
    case "pinza":
      return <PinzaMenuTemplate {...props} />;
    case "classic":
      return <ClassicMenuTemplate {...props} />;
    case "minimal":
      return <MinimalMenuTemplate {...props} />;
    default:
      return <ClassicMenuTemplate {...props} />;
  }
}
