import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="max-w-4xl p-6 overflow-y-auto flex-1">
      <section className="mb-10">
        <p className="text-lg mt-2">
          A desktop companion app to help you find and manage Clone Hero / YARG charts.
        </p>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Drum Sheet Music Viewer</CardTitle>
            <CardDescription>
              View drum charts as sheet music with synced click tracks and individual audio track control.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/sheet-music" className={buttonVariants({ variant: 'default' })}>Go to Tool</Link>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Spotify Library Scanner</CardTitle>
            <CardDescription>Find charts on Encore that match songs in your Spotify playlists.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link to="/spotify" className={buttonVariants({ variant: 'default' })}>Go to Tool</Link>
          </CardFooter>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Chart Updater</CardTitle>
            <CardDescription>Check Encore for newer versions of your installed charts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/updates" className={buttonVariants({ variant: 'default' })}>Go to Tool</Link>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle>Browse & Download</CardTitle>
            <CardDescription>Search and download charts from the Encore catalog directly to your songs folder.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/browse" className={buttonVariants({ variant: 'default' })}>Browse Charts</Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
