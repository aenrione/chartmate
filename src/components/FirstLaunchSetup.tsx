import { useEffect, useState } from 'react';
import { getSongsFolderPath, promptForSongsFolder } from '@/lib/songs-folder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isMobileDevice } from '@/lib/platform';

export default function FirstLaunchSetup({ onComplete }: { onComplete: () => void }) {
  const [checking, setChecking] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isMobileDevice) {
      onComplete();
      return;
    }
    getSongsFolderPath().then(path => {
      if (path) {
        onComplete();
      } else {
        setShow(true);
        setChecking(false);
      }
    });
  }, []);

  const handleSelect = async () => {
    try {
      await promptForSongsFolder();
    } catch {
      // cancelled — still proceed
    }
    onComplete();
  };

  if (checking || !show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Welcome to Chartmate</CardTitle>
          <CardDescription>
            Select your Clone Hero / YARG songs folder to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={handleSelect}>Select Songs Folder</Button>
          <Button variant="ghost" onClick={onComplete}>Skip for now</Button>
        </CardContent>
      </Card>
    </div>
  );
}
