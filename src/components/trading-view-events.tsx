import { useEffect, useRef, memo } from "react";

function TradingViewEventsWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: "dark",
      isTransparent: true,
      locale: "en",
      countryFilter: "ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu",
      importanceFilter: "-1,0,1",
      width: "100%",
      height: "100%",
    });
    container.current?.appendChild(script);
  }, []);

  return (
    <div className="tradingview-widget-container h-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full" />
      <div className="tradingview-widget-copyright text-[10px] text-muted-foreground text-center pt-1">
        <a href="https://www.tradingview.com/economic-calendar/" rel="noopener nofollow" target="_blank" className="text-primary">
          Economic Calendar
        </a>
        <span> by TradingView</span>
      </div>
    </div>
  );
}

export default memo(TradingViewEventsWidget);
